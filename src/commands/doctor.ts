import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { findProjectRoot, readJsonFile } from '../utils/project.js';
import { resolveManifest } from '../utils/manifest.js';
import { findPageConflicts, findPageBackups } from '../utils/patchers.js';
import { findProviderIssues, getAdapters, readEnvVar } from '../utils/env-config.js';
import { heading, success, fail, warn, info, dim, label } from '../utils/ui.js';

function checkExists(root: string, path: string, description: string): boolean {
  const exists = existsSync(resolve(root, path));
  if (exists) {
    success(description);
  } else {
    fail(`${description} — missing: ${path}`);
  }
  return exists;
}

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

export function doctorCommand(): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Codapult Doctor');
  label('Project root', root);
  console.log();

  let issues = 0;
  let warnings = 0;

  // --- Project structure ---
  info('Project structure');
  if (!checkExists(root, 'package.json', 'package.json')) issues += 1;
  if (!checkExists(root, 'src/config/app.ts', 'App config (src/config/app.ts)')) issues += 1;
  if (!checkExists(root, 'src/lib/db/schema.ts', 'Database schema')) issues += 1;
  if (!checkExists(root, 'src/lib/auth/index.ts', 'Auth adapter')) issues += 1;
  if (!checkExists(root, 'src/lib/payments/index.ts', 'Payments adapter')) issues += 1;
  if (!checkExists(root, 'next.config.ts', 'Next.js config')) issues += 1;
  if (!checkExists(root, 'codapult.plugins.ts', 'Plugin registry')) warnings += 1;
  console.log();

  // --- Environment ---
  info('Environment');

  const envPath = resolve(root, '.env.local');
  if (!existsSync(envPath)) {
    fail('.env.local not found — run `codapult setup`');
    issues += 1;
  } else {
    success('.env.local exists');
    const envContent = readFileSync(envPath, 'utf-8');

    const adapters = getAdapters(envContent);
    label('  DB_PROVIDER', adapters.database);
    label('  AUTH_PROVIDER', adapters.auth);
    label('  PAYMENT_PROVIDER', adapters.payments);
    label('  STORAGE_PROVIDER', adapters.storage);
    label('  JOB_PROVIDER', adapters.jobs);
    label('  NOTIFICATION_TRANSPORT', adapters.notifications);

    const providerIssues = findProviderIssues(envContent);
    if (providerIssues.length === 0) {
      success('All provider-conditional env vars are set');
    } else {
      for (const i of providerIssues) {
        if (i.severity === 'error') {
          fail(`${i.key}: ${i.message}`);
          issues += 1;
        } else {
          warn(`${i.key}: ${i.message}`);
          warnings += 1;
        }
      }
    }

    if (!readEnvVar(envContent, 'NEXT_PUBLIC_APP_URL')) {
      warn('NEXT_PUBLIC_APP_URL not set — defaults to http://localhost:3000');
      warnings += 1;
    }
  }
  console.log();

  // --- Dependencies ---
  info('Dependencies');

  const nodeVersion = tryExec('node --version', root);
  if (nodeVersion) {
    const major = parseInt(nodeVersion.replace('v', ''), 10);
    if (major >= 20) {
      success(`Node.js ${nodeVersion}`);
    } else {
      fail(`Node.js ${nodeVersion} — requires v20+`);
      issues += 1;
    }
  } else {
    fail('Node.js not found');
    issues += 1;
  }

  const pnpmVersion = tryExec('pnpm --version', root);
  if (pnpmVersion) {
    success(`pnpm ${pnpmVersion}`);
  } else {
    fail('pnpm not found — install: npm i -g pnpm');
    issues += 1;
  }

  const nodeModulesExist = existsSync(resolve(root, 'node_modules'));
  if (nodeModulesExist) {
    success('node_modules installed');
  } else {
    fail('node_modules missing — run: pnpm install');
    issues += 1;
  }
  console.log();

  // --- TypeScript ---
  info('TypeScript');
  const tscResult = tryExec('npx tsc --noEmit 2>&1 | tail -1', root);
  if (tscResult === null || tscResult.includes('error')) {
    warn('TypeScript has errors — run: pnpm type-check');
    warnings += 1;
  } else {
    success('TypeScript compiles cleanly');
  }
  console.log();

  // --- Plugins ---
  info('Plugins');
  const pluginsDir = resolve(root, 'src/plugins');
  const installedPlugins = existsSync(pluginsDir)
    ? readdirSync(pluginsDir)
        .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
        .map((f) => f.replace('.ts', ''))
    : [];

  if (installedPlugins.length === 0) {
    dim('No plugins installed.');
  } else {
    let pluginProblems = 0;
    for (const pName of installedPlugins) {
      const resolved = resolveManifest(root, pName);
      if (!resolved?.manifest.install.pages) continue;
      const conflicts = findPageConflicts(root, resolved.manifest.install.pages).filter(
        (c) => !c.isStub,
      );
      if (conflicts.length === 0) continue;
      pluginProblems += 1;
      warn(`${pName}: ${conflicts.length} page conflict(s) shadow plugin stubs`);
      for (const c of conflicts) {
        dim(`  ${c.conflictRel}  (shadows ${c.pagePath})`);
      }
      dim(`  Fix: codapult plugins add ${pName} (will back up and overwrite)`);
    }
    if (pluginProblems === 0) {
      success(`${installedPlugins.length} plugin(s): no page conflicts`);
    } else {
      issues += pluginProblems;
    }

    const orphanBackups = findPageBackups(root);
    if (orphanBackups.length > 0) {
      warn(`${orphanBackups.length} page backup file(s) found:`);
      for (const b of orphanBackups) dim(`  ${b}`);
      dim('  These are restored automatically when the owning plugin is removed.');
      warnings += 1;
    }
  }
  console.log();

  // --- Git ---
  info('Git');

  const gitRemotes = tryExec('git remote -v', root);
  if (gitRemotes?.includes('codapult-upstream')) {
    success('Upstream remote configured');
  } else {
    dim('No upstream remote — run `codapult update` to set up');
  }

  const gitStatus = tryExec('git status --porcelain', root);
  if (gitStatus === '') {
    success('Working tree clean');
  } else if (gitStatus !== null) {
    const lines = gitStatus.split('\n').filter(Boolean);
    warn(`${lines.length} uncommitted change(s)`);
  }
  console.log();

  // --- Package versions ---
  info('Key packages');
  const pkg = readJsonFile(resolve(root, 'package.json'));
  if (pkg) {
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };
    const keyPackages = [
      'next',
      'react',
      'typescript',
      'drizzle-orm',
      'tailwindcss',
      'better-auth',
    ];
    for (const name of keyPackages) {
      if (deps[name]) {
        dim(`  ${name}: ${deps[name]}`);
      }
    }
  }
  console.log();

  // --- Summary ---
  heading('Summary');
  if (issues === 0 && warnings === 0) {
    success('Everything looks good!');
  } else {
    if (issues > 0) fail(`${issues} issue(s) found`);
    if (warnings > 0) warn(`${warnings} warning(s)`);
  }
  console.log();
}
