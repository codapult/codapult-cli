import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot } from '../../utils/project.js';
import { ENV_FILE_NAME } from '../../utils/project-env.js';
import { resolveManifest } from '../../utils/manifest.js';
import {
  patchSchemaImports,
  patchSchemaImportsPg,
  patchSchemaTables,
  patchSchemaTablesPg,
  patchDbReExports,
  patchNextConfig,
  createPluginRegistration,
  patchPages,
  findPageConflicts,
  patchEnvFile,
  patchPackageJson,
} from '../../utils/patchers.js';
import { envSourceSchema } from './schemas.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

export function registerPluginTools(server: McpServer): void {
  server.registerTool(
    'codapult_plugins_list',
    {
      title: 'List Plugins',
      description: 'List installed Codapult plugins with package names and versions',
      inputSchema: {},
    },
    () => {
      const root = getRoot();
      const pluginsDir = resolve(root, 'src/plugins');
      if (!existsSync(pluginsDir)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ plugins: [] }) }],
        };
      }

      const files = readdirSync(pluginsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

      const pkgPath = resolve(root, 'package.json');
      const deps: Record<string, string> = existsSync(pkgPath)
        ? (((JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>)
            .dependencies as Record<string, string>) ?? {})
        : {};

      const plugins = files.map((file) => {
        const name = file.replace('.ts', '');
        const content = readFileSync(resolve(pluginsDir, file), 'utf-8');
        const allImports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)];
        const pkgMatch = allImports.find((m) => m[1] && !m[1].startsWith('@/lib/'));
        const packageName = pkgMatch?.[1] ?? 'unknown';
        return { name, package: packageName, version: deps[packageName] ?? '' };
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ plugins }, null, 2) }],
      };
    },
  );

  server.registerTool(
    'codapult_plugins_add',
    {
      title: 'Add Plugin',
      description:
        'Install a Codapult plugin by name. Patches schema, config, pages, and env automatically.',
      inputSchema: {
        name: z.string().describe('Plugin name (e.g. "ai-kit", "video-player")'),
        env_source: envSourceSchema.optional(),
        dry_run: z
          .boolean()
          .default(false)
          .describe('Preview changes without modifying the project'),
      },
    },
    ({ name, env_source, dry_run }) => {
      const root = getRoot();
      const result = resolveManifest(root, name);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: `Plugin "${name}" not found` }],
          isError: true,
        };
      }

      const { manifest, pluginDir } = result;
      const steps: string[] = [];

      if (dry_run) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  dryRun: true,
                  plugin: manifest.name,
                  package: manifest.package,
                  changes: [
                    'Update package.json',
                    ...(manifest.install.schemaImports && manifest.install.schemaImports.length > 0
                      ? ['Update schema imports']
                      : []),
                    ...(manifest.install.schemaImportsPg &&
                    manifest.install.schemaImportsPg.length > 0
                      ? ['Update PostgreSQL schema imports']
                      : []),
                    ...(manifest.install.dbReExports && manifest.install.dbReExports.length > 0
                      ? ['Update DB re-exports']
                      : []),
                    ...(manifest.install.schemaTables ? ['Update schema tables'] : []),
                    ...(manifest.install.schemaTablesPg ? ['Update PostgreSQL schema tables'] : []),
                    ...(manifest.install.pages && Object.keys(manifest.install.pages).length > 0
                      ? ['Create plugin pages']
                      : []),
                    'Register plugin',
                    ...(manifest.install.env &&
                    Object.keys(manifest.install.env).length > 0 &&
                    env_source !== 'process'
                      ? [`Update ${ENV_FILE_NAME}`]
                      : []),
                  ],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'add');
      steps.push('package.json updated');

      if (manifest.install.schemaImports && manifest.install.schemaImports.length > 0) {
        const imports = manifest.install.schemaImports;
        patchSchemaImports(root, manifest.name, imports, 'add');
        steps.push(`Schema imports: ${imports.join(', ')}`);
      }
      if (manifest.install.schemaImportsPg && manifest.install.schemaImportsPg.length > 0) {
        const imports = manifest.install.schemaImportsPg;
        patchSchemaImportsPg(root, manifest.name, imports, 'add');
        steps.push(`PostgreSQL schema imports: ${imports.join(', ')}`);
      }
      if (manifest.install.dbReExports && manifest.install.dbReExports.length > 0) {
        const reExports = manifest.install.dbReExports;
        patchDbReExports(root, manifest.name, reExports, 'add');
        steps.push(`DB re-exports: ${reExports.join(', ')}`);
      }
      if (manifest.install.schemaTables) {
        patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'add');
        steps.push('Schema tables added');
      }
      if (manifest.install.schemaTablesPg) {
        patchSchemaTablesPg(root, manifest.name, pluginDir, manifest.install.schemaTablesPg, 'add');
        steps.push('PostgreSQL schema tables added');
      }
      if (
        (manifest.install.transpilePackages?.length ?? 0) > 0 ||
        (manifest.install.serverExternalPackages?.length ?? 0) > 0
      ) {
        patchNextConfig(root, manifest.name, manifest, 'add');
        steps.push('next.config.ts updated');
      }
      let backedUp: string[] = [];
      if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
        const conflicts = findPageConflicts(root, manifest.install.pages);
        backedUp = conflicts.filter((c) => !c.isStub).map((c) => c.conflictRel);
        patchPages(root, manifest.name, manifest.install.pages, 'add', {
          onConflict: 'backup',
        });
        steps.push(`${Object.keys(manifest.install.pages).length} page(s) created`);
        if (backedUp.length > 0) {
          steps.push(
            `Backed up ${backedUp.length} existing page file(s) as *.codapult-bak-${manifest.name}`,
          );
        }
      }
      createPluginRegistration(root, manifest.name, manifest.package, 'add');
      steps.push('Plugin registered');

      if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
        if (env_source === 'process') {
          steps.push('Project uses process.env; add plugin env vars outside the CLI');
        } else {
          patchEnvFile(root, manifest.name, manifest.install.env, 'add');
          steps.push(`Env vars added to ${ENV_FILE_NAME}`);
        }
      }

      const output = {
        plugin: manifest.name,
        package: manifest.package,
        version: manifest.version,
        steps,
        backedUpPages: backedUp,
        nextSteps: [
          'Run: pnpm install --no-frozen-lockfile',
          'Run: pnpm db:push (if schema changed)',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    },
  );

  server.registerTool(
    'codapult_plugins_remove',
    {
      title: 'Remove Plugin',
      description: 'Uninstall a Codapult plugin by name. Reverts all patches.',
      inputSchema: {
        name: z.string().describe('Plugin name to remove'),
        env_source: envSourceSchema.optional(),
        dry_run: z
          .boolean()
          .default(false)
          .describe('Preview changes without modifying the project'),
      },
    },
    ({ name, env_source, dry_run }) => {
      const root = getRoot();
      const result = resolveManifest(root, name);
      const manifest = result?.manifest ?? {
        name,
        package: `@codapult/plugin-${name}`,
        version: '0.0.0',
        description: '',
        install: {},
      };
      const pluginDir = result?.pluginDir ?? '';
      const steps: string[] = [];

      if (dry_run) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  dryRun: true,
                  plugin: manifest.name,
                  changes: [
                    'Remove plugin pages',
                    'Unregister plugin',
                    'Remove schema changes',
                    'Update package.json',
                    ...(env_source !== 'process' ? [`Update ${ENV_FILE_NAME}`] : []),
                  ],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
        patchPages(root, manifest.name, manifest.install.pages, 'remove');
        steps.push('Pages removed');
      }
      createPluginRegistration(root, manifest.name, manifest.package, 'remove');
      steps.push('Plugin unregistered');

      if (manifest.install.schemaTables) {
        patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'remove');
        steps.push('Schema tables removed');
      }
      if (manifest.install.schemaTablesPg) {
        patchSchemaTablesPg(
          root,
          manifest.name,
          pluginDir,
          manifest.install.schemaTablesPg,
          'remove',
        );
        steps.push('PostgreSQL schema tables removed');
      }
      if (manifest.install.schemaImports && manifest.install.schemaImports.length > 0) {
        patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'remove');
        steps.push('Schema imports removed');
      }
      if (manifest.install.schemaImportsPg && manifest.install.schemaImportsPg.length > 0) {
        patchSchemaImportsPg(root, manifest.name, manifest.install.schemaImportsPg, 'remove');
        steps.push('PostgreSQL schema imports removed');
      }
      if (manifest.install.dbReExports && manifest.install.dbReExports.length > 0) {
        patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'remove');
        steps.push('DB re-exports removed');
      }
      if (
        (manifest.install.transpilePackages?.length ?? 0) > 0 ||
        (manifest.install.serverExternalPackages?.length ?? 0) > 0
      ) {
        patchNextConfig(root, manifest.name, manifest, 'remove');
        steps.push('next.config.ts reverted');
      }
      if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
        if (env_source === 'process') {
          steps.push(`Project uses process.env; no ${ENV_FILE_NAME} env vars were removed`);
        } else {
          patchEnvFile(root, manifest.name, manifest.install.env, 'remove');
          steps.push('Env vars removed');
        }
      }
      patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'remove');
      steps.push('Dependency removed');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ plugin: name, steps }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codapult_plugins_migrate',
    {
      title: 'Migrate Plugin Schema',
      description:
        "Update an installed plugin's schema in schema.ts to match the latest version. " +
        'Returns whether the schema changed. After this, run db:generate + db:migrate (production) ' +
        'or db:push (development) to apply changes to the database.',
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe('Plugin name (e.g. "crm"). Omit to migrate all installed plugins.'),
      },
    },
    ({ name }) => {
      const root = getRoot();

      const pluginsDir = resolve(root, 'src/plugins');
      const pluginNames: string[] = name
        ? [name]
        : existsSync(pluginsDir)
          ? readdirSync(pluginsDir)
              .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
              .map((f) => f.replace('.ts', ''))
          : [];

      if (pluginNames.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No installed plugins found.' }],
        };
      }

      const results: { plugin: string; updated: boolean; error?: string }[] = [];

      for (const pName of pluginNames) {
        const res = resolveManifest(root, pName);
        if (!res) {
          results.push({
            plugin: pName,
            updated: false,
            error: 'manifest not found',
          });
          continue;
        }

        const { manifest, pluginDir } = res;

        if (!manifest.install.schemaTables && !manifest.install.schemaTablesPg) {
          results.push({ plugin: pName, updated: false });
          continue;
        }

        const updatedSqlite = manifest.install.schemaTables
          ? patchSchemaTables(
              root,
              manifest.name,
              pluginDir,
              manifest.install.schemaTables,
              'update',
            )
          : false;
        const updatedPostgres = manifest.install.schemaTablesPg
          ? patchSchemaTablesPg(
              root,
              manifest.name,
              pluginDir,
              manifest.install.schemaTablesPg,
              'update',
            )
          : false;
        const updated = updatedSqlite || updatedPostgres;

        const imports = manifest.install.schemaImports;
        if (updated && imports && imports.length > 0) {
          patchSchemaImports(root, manifest.name, imports, 'add');
        }
        const importsPg = manifest.install.schemaImportsPg;
        if (updated && importsPg && importsPg.length > 0) {
          patchSchemaImportsPg(root, manifest.name, importsPg, 'add');
        }

        results.push({ plugin: pName, updated });
      }

      const anyUpdated = results.some((r) => r.updated);
      const output = {
        results,
        schemaChanged: anyUpdated,
        nextSteps: anyUpdated
          ? [
              'Run: pnpm db:generate (create migration file)',
              'Run: pnpm db:migrate (apply migration)',
              'Or for development: pnpm db:push',
            ]
          : [],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    },
  );
}
