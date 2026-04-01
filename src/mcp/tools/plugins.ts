import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot } from '../../utils/project.js';
import { resolveManifest } from '../../utils/manifest.js';
import {
  patchSchemaImports, patchSchemaTables, patchDbReExports,
  patchNextConfig, createPluginRegistration, patchPages,
  patchEnvFile, patchPackageJson,
} from '../../utils/patchers.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a LaunchKit project');
  return root;
}

export function registerPluginTools(server: McpServer): void {
  server.registerTool(
    'launchkit_plugins_list',
    {
      title: 'List Plugins',
      description: 'List installed LaunchKit plugins with package names and versions',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const pluginsDir = resolve(root, 'src/plugins');
      if (!existsSync(pluginsDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ plugins: [] }) }] };
      }

      const files = readdirSync(pluginsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

      const pkgPath = resolve(root, 'package.json');
      const deps: Record<string, string> = existsSync(pkgPath)
        ? ((JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>).dependencies as Record<string, string>) ?? {}
        : {};

      const plugins = files.map(file => {
        const name = file.replace('.ts', '');
        const content = readFileSync(resolve(pluginsDir, file), 'utf-8');
        const allImports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)];
        const pkgMatch = allImports.find(m => m[1] && !m[1].startsWith('@/lib/'));
        const packageName = pkgMatch?.[1] ?? 'unknown';
        return { name, package: packageName, version: deps[packageName] ?? '' };
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify({ plugins }, null, 2) }] };
    },
  );

  server.registerTool(
    'launchkit_plugins_add',
    {
      title: 'Add Plugin',
      description: 'Install a LaunchKit plugin by name. Patches schema, config, pages, and env automatically.',
      inputSchema: {
        name: z.string().describe('Plugin name (e.g. "ai-kit", "video-player")'),
      },
    },
    async ({ name }) => {
      const root = getRoot();
      const result = resolveManifest(root, name);
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Plugin "${name}" not found` }], isError: true };
      }

      const { manifest, pluginDir } = result;
      const steps: string[] = [];

      patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'add');
      steps.push('package.json updated');

      if (manifest.install.schemaImports?.length) {
        patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'add');
        steps.push(`Schema imports: ${manifest.install.schemaImports.join(', ')}`);
      }
      if (manifest.install.dbReExports?.length) {
        patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'add');
        steps.push(`DB re-exports: ${manifest.install.dbReExports.join(', ')}`);
      }
      if (manifest.install.schemaTables) {
        patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'add');
        steps.push('Schema tables added');
      }
      if (manifest.install.transpilePackages?.length || manifest.install.serverExternalPackages?.length) {
        patchNextConfig(root, manifest.name, manifest, 'add');
        steps.push('next.config.ts updated');
      }
      if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
        patchPages(root, manifest.name, manifest.install.pages, 'add');
        steps.push(`${Object.keys(manifest.install.pages).length} page(s) created`);
      }
      createPluginRegistration(root, manifest.name, manifest.package, 'add');
      steps.push('Plugin registered');

      if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
        patchEnvFile(root, manifest.name, manifest.install.env, 'add');
        steps.push('Env vars added to .env.local');
      }

      const output = {
        plugin: manifest.name,
        package: manifest.package,
        version: manifest.version,
        steps,
        nextSteps: ['Run: pnpm install --no-frozen-lockfile', 'Run: pnpm db:push (if schema changed)'],
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    },
  );

  server.registerTool(
    'launchkit_plugins_remove',
    {
      title: 'Remove Plugin',
      description: 'Uninstall a LaunchKit plugin by name. Reverts all patches.',
      inputSchema: {
        name: z.string().describe('Plugin name to remove'),
      },
    },
    async ({ name }) => {
      const root = getRoot();
      const result = resolveManifest(root, name);
      const manifest = result?.manifest ?? {
        name, package: `@launchkit/plugin-${name}`, version: '0.0.0', description: '', install: {},
      };
      const pluginDir = result?.pluginDir ?? '';
      const steps: string[] = [];

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
      if (manifest.install.schemaImports?.length) {
        patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'remove');
        steps.push('Schema imports removed');
      }
      if (manifest.install.dbReExports?.length) {
        patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'remove');
        steps.push('DB re-exports removed');
      }
      if (manifest.install.transpilePackages?.length || manifest.install.serverExternalPackages?.length) {
        patchNextConfig(root, manifest.name, manifest, 'remove');
        steps.push('next.config.ts reverted');
      }
      if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
        patchEnvFile(root, manifest.name, manifest.install.env, 'remove');
        steps.push('Env vars removed');
      }
      patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'remove');
      steps.push('Dependency removed');

      return { content: [{ type: 'text' as const, text: JSON.stringify({ plugin: name, steps }, null, 2) }] };
    },
  );
}
