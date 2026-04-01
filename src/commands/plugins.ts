import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { resolveManifest } from '../utils/manifest.js';
import {
  patchSchemaImports,
  patchSchemaTables,
  patchDbReExports,
  patchNextConfig,
  createPluginRegistration,
  patchPages,
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
// launchkit plugins add <name>
// ---------------------------------------------------------------------------

export async function pluginsAddCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a LaunchKit project.');
    process.exit(1);
  }

  heading(`Installing plugin: ${name}`);

  const result = resolveManifest(root, name);
  if (!result) {
    fail(`Plugin "${name}" not found.`);
    dim('Searched for launchkit-plugin.json in:');
    dim(`  ../launchkit-plugin-${name}/`);
    dim(`  ../launchkit-${name}/`);
    dim(`  ../${name}/`);
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
  if (manifest.install.schemaImports?.length) {
    info('Adding schema imports...');
    patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'add');
    success(`Added imports: ${manifest.install.schemaImports.join(', ')}`);
  }

  // 3. Re-export tables from db/index.ts
  if (manifest.install.dbReExports?.length) {
    info('Adding DB re-exports...');
    patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'add');
    success(`Re-exported: ${manifest.install.dbReExports.join(', ')}`);
  }

  // 4. Copy schema tables
  if (manifest.install.schemaTables) {
    info('Adding schema tables...');
    patchSchemaTables(root, manifest.name, pluginDir, manifest.install.schemaTables, 'add');
    success('Schema tables added');
  }

  // 5. Patch next.config.ts
  if (manifest.install.transpilePackages?.length || manifest.install.serverExternalPackages?.length) {
    info('Updating next.config.ts...');
    patchNextConfig(root, manifest.name, manifest, 'add');
    success('next.config.ts updated');
  }

  // 6. Install shadcn components
  if (manifest.install.shadcnComponents?.length) {
    info(`Installing shadcn components: ${manifest.install.shadcnComponents.join(', ')}...`);
    const components = manifest.install.shadcnComponents.join(' ');
    if (!execQuiet(`npx shadcn@latest add ${components} --yes`, root)) {
      warn('shadcn install failed — you may need to add components manually');
    } else {
      success('shadcn components installed');
    }
  }

  // 7. Create page wrappers
  if (manifest.install.pages && Object.keys(manifest.install.pages).length > 0) {
    info('Creating page wrappers...');
    patchPages(root, manifest.name, manifest.install.pages, 'add');
    success(`${Object.keys(manifest.install.pages).length} page(s) created`);
  }

  // 8. Register plugin (src/plugins/<name>.ts + regenerate barrel)
  info('Registering plugin...');
  createPluginRegistration(root, manifest.name, manifest.package, 'add');
  success(`src/plugins/${manifest.name}.ts created`);

  // 9. Append env vars
  if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
    info('Adding environment variables...');
    patchEnvFile(root, manifest.name, manifest.install.env, 'add');
    success('Environment variables added to .env.local');
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
// launchkit plugins remove <name>
// ---------------------------------------------------------------------------

export async function pluginsRemoveCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a LaunchKit project.');
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
      package: `@launchkit/plugin-${name}`,
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
  if (manifest.install.schemaImports?.length) {
    info('Removing schema imports...');
    patchSchemaImports(root, manifest.name, manifest.install.schemaImports, 'remove');
    success('Schema imports removed');
  }

  // 5. Remove DB re-exports
  if (manifest.install.dbReExports?.length) {
    info('Removing DB re-exports...');
    patchDbReExports(root, manifest.name, manifest.install.dbReExports, 'remove');
    success('DB re-exports removed');
  }

  // 6. Remove next.config.ts patches
  if (manifest.install.transpilePackages?.length || manifest.install.serverExternalPackages?.length) {
    info('Reverting next.config.ts...');
    patchNextConfig(root, manifest.name, manifest, 'remove');
    success('next.config.ts reverted');
  }

  // 7. Remove env vars
  if (manifest.install.env && Object.keys(manifest.install.env).length > 0) {
    info('Removing environment variables...');
    patchEnvFile(root, manifest.name, manifest.install.env, 'remove');
    success('Environment variables removed');
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
// launchkit plugins list
// ---------------------------------------------------------------------------

export async function pluginsListCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a LaunchKit project.');
    process.exit(1);
  }

  heading('Installed Plugins');

  const pluginsDir = resolve(root, 'src/plugins');
  if (!existsSync(pluginsDir)) {
    dim('No plugins installed.');
    dim('Use: launchkit plugins add <name>');
    console.log();
    return;
  }

  const files = readdirSync(pluginsDir).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts',
  );

  if (files.length === 0) {
    dim('No plugins installed.');
    dim('Use: launchkit plugins add <name>');
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
    const packageMatch = allImports.find(
      (m) => m[1] && !m[1].startsWith('@/lib/'),
    );
    const packageName = packageMatch?.[1] ?? 'unknown';
    const version = deps[packageName] ?? '';

    success(`${pluginName}`);
    dim(`    package: ${packageName}`);
    if (version) dim(`    version: ${version}`);
  }

  console.log();
}
