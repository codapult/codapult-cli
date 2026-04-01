import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, info, dim, warn, confirm } from '../utils/ui.js';

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// codapult deploy vercel
// ---------------------------------------------------------------------------

export async function deployVercelCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  heading('Deploy to Vercel');

  // 1. Check Vercel CLI
  if (!hasCommand('vercel')) {
    fail('Vercel CLI not found.');
    dim('Install: npm i -g vercel');
    process.exit(1);
  }
  success('Vercel CLI found');

  // 2. Check vercel.json
  const vercelConfig = resolve(root, 'vercel.json');
  if (existsSync(vercelConfig)) {
    success('vercel.json exists');
  } else {
    warn('vercel.json not found — Vercel will use defaults');
  }

  // 3. Check required env vars
  const envPath = resolve(root, '.env.local');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const critical = ['TURSO_DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'];
    for (const key of critical) {
      const match = content.match(new RegExp(`^${key}\\s*=\\s*"?(.+?)"?\\s*$`, 'm'));
      if (match && !/^(your-|generate-)/.test(match[1])) {
        success(`${key} configured`);
      } else {
        warn(`${key} may not be configured`);
      }
    }
  }

  // 4. Build check
  info('Running build check...');
  try {
    execSync('pnpm build', { cwd: root, stdio: 'pipe' });
    success('Build passed');
  } catch {
    fail('Build failed — fix errors before deploying');
    dim('Run: pnpm build');
    process.exit(1);
  }

  // 5. Deploy
  const proceed = await confirm('Deploy to Vercel now?');
  if (!proceed) {
    info('Cancelled.');
    return;
  }

  info('Deploying...');
  try {
    execSync('vercel --prod', { cwd: root, stdio: 'inherit' });
    success('Deployed to Vercel');
  } catch {
    fail('Vercel deploy failed');
  }
  console.log();
}

// ---------------------------------------------------------------------------
// codapult deploy docker
// ---------------------------------------------------------------------------

export async function deployDockerCommand(opts: { tag?: string }): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  heading('Deploy with Docker');

  // 1. Check Docker
  if (!hasCommand('docker')) {
    fail('Docker not found.');
    dim('Install: https://docs.docker.com/get-docker/');
    process.exit(1);
  }
  success('Docker found');

  // 2. Check Dockerfile
  const dockerfile = resolve(root, 'Dockerfile');
  if (!existsSync(dockerfile)) {
    fail('Dockerfile not found');
    process.exit(1);
  }
  success('Dockerfile exists');

  // 3. Check docker-compose.yml
  const composePath = resolve(root, 'docker-compose.yml');
  if (existsSync(composePath)) {
    success('docker-compose.yml exists');
  }

  // 4. Read package.json for name
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
  const appName = (pkg.name as string) || 'codapult';
  const tag = opts.tag || 'latest';
  const imageName = `${appName}:${tag}`;

  info(`Image: ${imageName}`);

  const proceed = await confirm('Build Docker image?');
  if (!proceed) {
    info('Cancelled.');
    return;
  }

  // 5. Build
  info('Building Docker image...');
  try {
    execSync(`docker build -t ${imageName} .`, { cwd: root, stdio: 'inherit' });
    success(`Image built: ${imageName}`);
  } catch {
    fail('Docker build failed');
    process.exit(1);
  }

  // 6. Offer to run
  console.log();
  const runNow = await confirm('Run container locally? (port 3000)');
  if (runNow) {
    info('Starting container...');
    dim(`docker run -p 3000:3000 --env-file .env.local ${imageName}`);
    try {
      execSync(`docker run -p 3000:3000 --env-file .env.local ${imageName}`, {
        cwd: root,
        stdio: 'inherit',
      });
    } catch {
      // Container stopped
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// codapult deploy status
// ---------------------------------------------------------------------------

export async function deployStatusCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  heading('Deploy Readiness');

  const checks = [
    { name: 'Dockerfile', path: 'Dockerfile' },
    { name: 'docker-compose.yml', path: 'docker-compose.yml' },
    { name: 'vercel.json', path: 'vercel.json' },
    { name: 'Terraform (AWS)', path: 'infra/terraform/main.tf' },
    { name: 'Pulumi (AWS)', path: 'infra/pulumi/index.ts' },
    { name: 'Helm chart', path: 'infra/helm/codapult/Chart.yaml' },
    { name: '.env.local', path: '.env.local' },
  ];

  for (const { name, path } of checks) {
    if (existsSync(resolve(root, path))) {
      success(name);
    } else {
      dim(`  · ${name} — not found`);
    }
  }

  // Check if standalone output is enabled
  const nextConfig = resolve(root, 'next.config.ts');
  if (existsSync(nextConfig)) {
    const content = readFileSync(nextConfig, 'utf-8');
    if (content.includes("output: 'standalone'")) {
      success('Next.js standalone output enabled');
    } else {
      warn('Next.js standalone output not enabled (required for Docker)');
    }
  }

  // Check engines
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
  const engines = pkg.engines as Record<string, string> | undefined;
  if (engines?.node) {
    success(`Node engine: ${engines.node}`);
  } else {
    warn('No Node engine constraint in package.json');
  }

  console.log();
  dim('Deploy targets:');
  dim('  codapult deploy vercel   — Vercel (recommended)');
  dim('  codapult deploy docker   — Docker build + run');
  console.log();
}
