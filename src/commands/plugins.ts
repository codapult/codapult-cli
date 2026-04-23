import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import {
  ENV_FILE_NAME,
  getProjectEnvSource,
  type ProjectEnvOptions,
} from '../utils/project-env.js';
import { resolveManifest } from '../utils/manifest.js';
import { clonePlugin } from '../utils/git.js';
import {
  patchSchemaImports,
  patchSchemaTables,
  patchDbReExports,
  patchNextConfig,
  createPluginRegistration,
  patchPages,
  findPageConflicts,
  patchEnvFile,
  patchPackageJson,
} from '../utils/patchers.js';
import { heading, success, fail, warn, info, dim, confirm } from '../utils/ui.js';

function execQuiet(cmd: string, cwd: string): boolean {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// codapult plugins add <name>
// ---------------------------------------------------------------------------

export async function pluginsAddCommand(
  name: string,
  options: { from?: string; ci?: boolean } & ProjectEnvOptions = {},
): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading(`Installing plugin: ${name}`);

  // Clone from a git URL when --from is provided
  if (options.from) {
    info(`Cloning from ${options.from}...`);
    try {
      const { pluginDir } = clonePlugin(root, options.from);
      success(`Cloned to ${pluginDir}`);
    } catch (err) {
      fail(`Git clone failed: ${err instanceof Error ? err.message : String(err)}`);
      dim('Make sure you have access to the repository and git is installed.');
      process.exit(1);
    }
  }

  const result = resolveManifest(root, name);
  if (!result) {
    fail(`Plugin "${name}" not found.`);
    dim('Searched for codapult-plugin.json in:');
    dim(`  ../codapult-plugin-${name}/`);
    dim(`  ../codapult-${name}/`);
    dim(`  ../${name}/`);
    dim(`  .codapult/plugins/codapult-plugin-${name}/`);
    if (!options.from) {
      dim('');
      dim('Tip: use --from <git-url> to install from a remote repository.');
    }
    process.exit(1);
  }

  const { manifest, pluginDir } = result;
  info(`Found: ${manifest.package}@${manifest.version}`);
  dim(`  ${manifest.description}`);
  dim(`  ${pluginDir}`);
  console.log();

  // 1. Add dependency to package.json
  info('Adding dependency to package.json...');
  patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'add');
  success('package.json updated');

  // 2. Patch schema imports
  if (manifest.install.schemaImports && manifest.install.schemaImports.length > 0) {
    const imports = manifest.install.schemaImports;
    info('Adding schema imports...');
    patchSchemaImports(root, manifest.name, imports, 'add');
    success(`Added imports: ${imports.join(', ')}`);
  }

  // 3. Re-export tables from db/index.ts
  if (manifest.install.dbReExports && manifest.install.dbReExports.length > 0) {
    const reExports = manifest.install.dbReExports;
    info('Adding DB re-exports...');
    patchDbReExports(root, manifest.name, reExports, 'add');
    success(`Re-exported: ${reExports.join(', ')}`);
  }

  // 4. Copy schema tables
  if (manifest.install.schemaTables) {
    info('Adding schema tables...');
    patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'add');
    success('Schema tables added');
  }

  // 5. Patch next.config.ts
  if (
    (manifest.install.transpilePackages?.length ?? 0) > 0 ||
    (manifest.install.serverExternalPackages?.length ?? 0) > 0
  ) {
    info('Updating next.config.ts...');
    patchNextConfig(root, manifest.name, manifest, 'add');
    success('next.config.ts updated');
  }

  // 6. Install shadcn components
  if (manifest.install.shadcnComponents && manifest.install.shadcnComponents.length > 0) {
    const SHADCN_NAME = /^[a-z][a-z0-9-]*$/;
    const shadcn = manifest.install.shadcnComponents;
    const invalid = shadcn.filter((c) => !SHADCN_NAME.test(c));
    if (invalid.length > 0) {
      warn(`Invalid shadcn component names skipped: ${invalid.join(', ')}`);
    }
    const valid = shadcn.filter((c) => SHADCN_NAME.test(c));
    if (valid.length > 0) {
      info(`Installing shadcn components: ${valid.join(', ')}...`);
      const shadcnResult = spawnSync('npx', ['shadcn@latest', 'add', ...valid, '--yes'], {
        cwd: root,
        stdio: 'pipe',
      });
      if (shadcnResult.status !== 0) {
        warn('shadcn install failed — you may need to add components manually');
      } else {
        success('shadcn components installed');
      }
    }
  }

  // 7. Create page wrappers
  if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
    const pageEntries = manifest.install.pages;
    const conflicts = findPageConflicts(root, pageEntries);
    const nonStubConflicts = conflicts.filter((c) => !c.isStub);

    if (nonStubConflicts.length > 0) {
      warn(
        `Found ${nonStubConflicts.length} existing page file(s) that would collide with the plugin:`,
      );
      for (const c of nonStubConflicts) {
        const hint = c.isExactPath ? 'same path' : 'same route, different extension';
        dim(`  ${c.conflictRel}  (${hint})`);
      }

      if (options.ci) {
        info(`CI mode: backing up conflicting files as *.codapult-bak-${manifest.name}`);
      } else {
        const proceed = await confirm(
          `Back up conflicting files as *.codapult-bak-${manifest.name} and install?`,
          true,
        );
        if (!proceed) {
          fail('Aborted by user. Resolve conflicts manually, then re-run.');
          dim('To restore later, rename *.codapult-bak-* back or reinstall the plugin.');
          process.exit(1);
        }
      }
    }

    info('Creating page wrappers...');
    patchPages(root, manifest.name, pageEntries, 'add', { onConflict: 'backup' });
    success(`${Object.keys(pageEntries).length} page(s) created`);
    if (nonStubConflicts.length > 0) {
      dim(
        `Original files preserved as *.codapult-bak-${manifest.name}. ` +
          `They are restored automatically when you run: codapult plugins remove ${manifest.name}`,
      );
    }
  }

  // 8. Register plugin (src/plugins/<name>.ts + regenerate barrel)
  info('Registering plugin...');
  createPluginRegistration(root, manifest.name, manifest.package, 'add');
  success(`src/plugins/${manifest.name}.ts created`);

  // 9. Append env vars (skipped in CI — env vars are configured in the hosting dashboard)
  if (!options.ci && manifest.install.env && Object.keys(manifest.install.env).length > 0) {
    info('Adding environment variables...');
    if (getProjectEnvSource(options) === 'process') {
      warn(`Project uses process.env — skipping ${ENV_FILE_NAME} patch`);
      dim('Add the plugin env vars in your shell, CI, or hosting dashboard.');
    } else {
      patchEnvFile(root, manifest.name, manifest.install.env, 'add');
      success(`Environment variables added to ${ENV_FILE_NAME}`);
    }
  }

  if (options.ci) {
    heading('Done!');
    success(`Plugin "${manifest.name}" installed (CI mode).`);
    dim('Skipped: pnpm install, db:push, env patching, optional deps.');
    dim('Run pnpm install separately after this command.');
    console.log();
    return;
  }

  // 10. pnpm install
  info('Installing dependencies...');
  if (!execQuiet('pnpm install --no-frozen-lockfile', root)) {
    warn('pnpm install failed — run manually: pnpm install --no-frozen-lockfile');
  } else {
    success('Dependencies installed');
  }

  // 11. pnpm db:push
  if (manifest.install.schemaTables) {
    info('Applying database schema...');
    if (!execQuiet('pnpm db:push', root)) {
      warn('db:push failed — run manually: pnpm db:push');
    } else {
      success('Database schema applied');
    }
  }

  // Optional deps prompt
  if (manifest.install.optionalDeps && Object.keys(manifest.install.optionalDeps).length > 0) {
    console.log();
    info('Optional dependencies:');
    for (const [pkg, desc] of Object.entries(manifest.install.optionalDeps)) {
      dim(`  ${pkg} — ${desc}`);
    }
    const installOptional = await confirm('Install optional dependencies?', false);
    if (installOptional) {
      const pkgs = Object.keys(manifest.install.optionalDeps).join(' ');
      execQuiet(`pnpm add ${pkgs}`, root);
      success('Optional dependencies installed');
    }
  }

  heading('Done!');
  success(`Plugin "${manifest.name}" installed successfully.`);
  dim('Start your dev server: pnpm dev');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult plugins remove <name>
// ---------------------------------------------------------------------------

export async function pluginsRemoveCommand(
  name: string,
  options: ProjectEnvOptions = {},
): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading(`Removing plugin: ${name}`);

  const result = resolveManifest(root, name);
  let manifest = result?.manifest;
  const pluginDir = result?.pluginDir ?? '';

  if (!manifest) {
    warn(`Manifest for "${name}" not found — performing basic cleanup.`);
    manifest = {
      name,
      package: `@codapult/plugin-${name}`,
      version: '0.0.0',
      description: '',
      install: {},
    };
  }

  const proceed = await confirm(`Remove plugin "${name}"? This will modify project files.`);
  if (!proceed) {
    info('Cancelled.');
    return;
  }

  // Reverse order of installation

  // 1. Remove page wrappers
  if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
    info('Removing page wrappers...');
    patchPages(root, manifest.name, manifest.install.pages, 'remove');
    success('Pages removed');
  }

  // 2. Unregister plugin
  info('Unregistering plugin...');
  createPluginRegistration(root, manifest.name, manifest.package, 'remove');
  success('Plugin unregistered');

  // 3. Remove schema tables
  if (manifest.install.schemaTables) {
    info('Removing schema tables...');
    patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'remove');
    success('Schema tables removed');
  }

  // 4. Remove schema imports
  if (manifest.install.schemaImports && manifest.install.schemaImports.length > 0) {
    info('Removing schema imports...');
    patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'remove');
    success('Schema imports removed');
  }

  // 5. Remove DB re-exports
  if (manifest.install.dbReExports && manifest.install.dbReExports.length > 0) {
    info('Removing DB re-exports...');
    patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'remove');
    success('DB re-exports removed');
  }

  // 6. Remove next.config.ts patches
  if (
    (manifest.install.transpilePackages?.length ?? 0) > 0 ||
    (manifest.install.serverExternalPackages?.length ?? 0) > 0
  ) {
    info('Reverting next.config.ts...');
    patchNextConfig(root, manifest.name, manifest, 'remove');
    success('next.config.ts reverted');
  }

  // 7. Remove env vars
  if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
    info('Removing environment variables...');
    if (getProjectEnvSource(options) === 'process') {
      warn(`Project uses process.env — no ${ENV_FILE_NAME} changes to remove`);
    } else {
      patchEnvFile(root, manifest.name, manifest.install.env, 'remove');
      success('Environment variables removed');
    }
  }

  // 8. Remove dependency
  info('Removing dependency...');
  patchPackageJson(root, manifest.name, manifest.package, pluginDir, 'remove');
  success('Dependency removed');

  // 9. pnpm install
  info('Updating dependencies...');
  execQuiet('pnpm install --no-frozen-lockfile', root);
  success('Dependencies updated');

  heading('Done!');
  success(`Plugin "${name}" removed.`);
  dim('You may want to run: pnpm db:push');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult plugins migrate [name]
// ---------------------------------------------------------------------------

function getInstalledPluginNames(root: string): string[] {
  const pluginsDir = resolve(root, 'src/plugins');
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace('.ts', ''));
}

export async function pluginsMigrateCommand(
  name: string | undefined,
  options: { push?: boolean },
): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  const pluginNames = name ? [name] : getInstalledPluginNames(root);

  if (pluginNames.length === 0) {
    info('No installed plugins found.');
    dim('Use: codapult plugins add <name>');
    return;
  }

  heading(name ? `Migrating plugin: ${name}` : 'Migrating all installed plugins');

  let schemaUpdated = false;

  for (const pName of pluginNames) {
    const result = resolveManifest(root, pName);
    if (!result) {
      warn(`Plugin "${pName}" — manifest not found, skipping.`);
      continue;
    }

    const { manifest, pluginDir } = result;

    if (!manifest.install.schemaTables) {
      dim(`${manifest.name}: no schema tables — skipping.`);
      continue;
    }

    const updated = patchSchemaTables(
      root,
      manifest.name,
      pluginDir,
      manifest.install.schemaTables,
      'update',
    );

    if (updated) {
      success(`${manifest.name}: schema updated in schema.ts`);
      schemaUpdated = true;
    } else {
      dim(`${manifest.name}: schema is already up to date.`);
    }

    // Also refresh imports in case the plugin added new drizzle column types
    if (manifest.install.schemaImports && manifest.install.schemaImports.length > 0) {
      patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'add');
    }
  }

  if (!schemaUpdated) {
    console.log();
    info('All plugin schemas are up to date — no migration needed.');
    return;
  }

  console.log();

  if (options.push) {
    info('Applying schema changes (db:push)...');
    if (!execQuiet('pnpm db:push', root)) {
      fail('db:push failed — run manually: pnpm db:push');
      process.exit(1);
    }
    success('Database schema applied');
  } else {
    info('Generating migration...');
    try {
      execSync('pnpm db:generate', { cwd: root, stdio: 'inherit' });
      success('Migration generated');
    } catch {
      fail('db:generate failed — run manually: pnpm db:generate');
      process.exit(1);
    }

    console.log();
    const apply = await confirm('Apply the migration now (pnpm db:migrate)?');
    if (apply) {
      try {
        execSync('pnpm db:migrate', { cwd: root, stdio: 'inherit' });
        success('Migration applied');
      } catch {
        fail('db:migrate failed — run manually: pnpm db:migrate');
        process.exit(1);
      }
    } else {
      info('Skipped. Apply later with: pnpm db:migrate');
    }
  }

  heading('Done!');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult plugins list
// ---------------------------------------------------------------------------

export function pluginsListCommand(): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Installed Plugins');

  const pluginsDir = resolve(root, 'src/plugins');
  if (!existsSync(pluginsDir)) {
    dim('No plugins installed.');
    dim('Use: codapult plugins add <name>');
    console.log();
    return;
  }

  const files = readdirSync(pluginsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

  if (files.length === 0) {
    dim('No plugins installed.');
    dim('Use: codapult plugins add <name>');
    console.log();
    return;
  }

  // Read package.json for version info
  const pkgPath = resolve(root, 'package.json');
  let deps: Record<string, string> = {};
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    deps = (pkg.dependencies ?? {}) as Record<string, string>;
  }

  for (const file of files) {
    const pluginName = file.replace('.ts', '');
    const content = readFileSync(resolve(pluginsDir, file), 'utf-8');
    const allImports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)];
    const packageMatch = allImports.find((m) => m[1] && !m[1].startsWith('@/lib/'));
    const packageName = packageMatch?.[1] ?? 'unknown';
    const version = deps[packageName] ?? '';

    success(pluginName);
    dim(`    package: ${packageName}`);
    if (version) dim(`    version: ${version}`);
  }

  console.log();
}
