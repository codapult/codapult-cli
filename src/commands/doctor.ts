import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { findProjectRoot, readJsonFile } from '../utils/project.js';
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

function checkEnvVar(envContent: string, key: string, description: string): boolean {
  const regex = new RegExp(`^${key}=.+`, 'm');
  const found = regex.test(envContent);
  if (found) {
    success(description);
  } else {
    warn(`${description} — not set: ${key}`);
  }
  return found;
}

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

export async function doctorCommand(): Promise<void> {
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
  if (!checkExists(root, 'package.json', 'package.json')) issues++;
  if (!checkExists(root, 'src/config/app.ts', 'App config (src/config/app.ts)')) issues++;
  if (!checkExists(root, 'src/lib/db/schema.ts', 'Database schema')) issues++;
  if (!checkExists(root, 'src/lib/auth/index.ts', 'Auth adapter')) issues++;
  if (!checkExists(root, 'src/lib/payments/index.ts', 'Payments adapter')) issues++;
  if (!checkExists(root, 'next.config.ts', 'Next.js config')) issues++;
  if (!checkExists(root, 'codapult.plugins.ts', 'Plugin registry')) warnings++;
  console.log();

  // --- Environment ---
  info('Environment');

  const envPath = resolve(root, '.env.local');
  if (!existsSync(envPath)) {
    fail('.env.local not found — run `codapult setup`');
    issues++;
  } else {
    success('.env.local exists');
    const envContent = readFileSync(envPath, 'utf-8');

    if (!checkEnvVar(envContent, 'TURSO_DATABASE_URL', 'Database URL')) issues++;
    if (!checkEnvVar(envContent, 'BETTER_AUTH_SECRET', 'Auth secret')) warnings++;
    if (!checkEnvVar(envContent, 'AUTH_PROVIDER', 'Auth provider')) warnings++;
    if (!checkEnvVar(envContent, 'PAYMENT_PROVIDER', 'Payment provider')) warnings++;
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
      issues++;
    }
  } else {
    fail('Node.js not found');
    issues++;
  }

  const pnpmVersion = tryExec('pnpm --version', root);
  if (pnpmVersion) {
    success(`pnpm ${pnpmVersion}`);
  } else {
    fail('pnpm not found — install: npm i -g pnpm');
    issues++;
  }

  const nodeModulesExist = existsSync(resolve(root, 'node_modules'));
  if (nodeModulesExist) {
    success('node_modules installed');
  } else {
    fail('node_modules missing — run: pnpm install');
    issues++;
  }
  console.log();

  // --- TypeScript ---
  info('TypeScript');
  const tscResult = tryExec('npx tsc --noEmit 2>&1 | tail -1', root);
  if (tscResult === null || tscResult.includes('error')) {
    warn('TypeScript has errors — run: pnpm type-check');
    warnings++;
  } else {
    success('TypeScript compiles cleanly');
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
