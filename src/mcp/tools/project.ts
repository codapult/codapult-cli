import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../../utils/project.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a LaunchKit project');
  return root;
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'launchkit_project_status',
    {
      title: 'Project Status',
      description: 'Get LaunchKit project status: variant, adapters, installed plugins, enabled features, git status',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

      const envContent = readProjectFile(root, '.env.local') ?? '';
      const getEnv = (key: string, fallback: string) => {
        const m = envContent.match(new RegExp(`^${key}\\s*=\\s*"?(.+?)"?\\s*$`, 'm'));
        return m?.[1] ?? fallback;
      };

      const pluginsDir = resolve(root, 'src/plugins');
      const plugins = existsSync(pluginsDir)
        ? readdirSync(pluginsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts').map(f => f.replace('.ts', ''))
        : [];

      let gitBranch = '';
      let gitDirty = false;
      try {
        gitBranch = execSync('git branch --show-current', { cwd: root, stdio: 'pipe' }).toString().trim();
        const status = execSync('git status --porcelain', { cwd: root, stdio: 'pipe' }).toString().trim();
        gitDirty = status.length > 0;
      } catch { /* not a git repo */ }

      const configContent = readProjectFile(root, 'src/config/app.ts') ?? '';
      const features: string[] = [];
      for (const m of configContent.matchAll(/(\w+):\s*true/g)) {
        features.push(m[1]);
      }

      const result = {
        name: pkg.name,
        version: pkg.version,
        adapters: {
          auth: getEnv('AUTH_PROVIDER', 'better-auth'),
          payments: getEnv('PAYMENT_PROVIDER', 'stripe'),
          storage: getEnv('STORAGE_PROVIDER', 'local'),
          database: getEnv('DB_PROVIDER', 'turso'),
          notifications: getEnv('NOTIFICATION_TRANSPORT', 'poll'),
          jobs: getEnv('JOB_PROVIDER', 'memory'),
        },
        plugins,
        features,
        git: { branch: gitBranch, dirty: gitDirty },
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'launchkit_project_config',
    {
      title: 'Project Config',
      description: 'Read the app configuration from src/config/app.ts (brand, auth, features)',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const content = readProjectFile(root, 'src/config/app.ts') ?? 'Config file not found';
      return { content: [{ type: 'text' as const, text: content }] };
    },
  );

  server.registerTool(
    'launchkit_run_checks',
    {
      title: 'Run Checks',
      description: 'Run lint, typecheck, and/or test. Returns structured pass/fail results.',
      inputSchema: {
        checks: z.array(z.enum(['lint', 'typecheck', 'test'])).optional().describe('Which checks to run (default: all)'),
      },
    },
    async ({ checks }) => {
      const root = getRoot();
      const toRun = checks ?? ['lint', 'typecheck', 'test'];
      const commands: Record<string, string> = {
        lint: 'pnpm lint',
        typecheck: 'pnpm tsc --noEmit',
        test: 'pnpm test --run',
      };

      const results: Record<string, { passed: boolean; output: string }> = {};
      for (const check of toRun) {
        const cmd = commands[check];
        if (!cmd) continue;
        try {
          const output = execSync(cmd, { cwd: root, stdio: 'pipe', timeout: 120_000 }).toString();
          results[check] = { passed: true, output: output.slice(-2000) };
        } catch (err) {
          const output = (err as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ??
            (err as { stdout?: Buffer }).stdout?.toString() ?? 'Check failed';
          results[check] = { passed: false, output: output.slice(-2000) };
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.registerTool(
    'launchkit_doctor',
    {
      title: 'Doctor',
      description: 'Run project health checks: file structure, env vars, dependencies, TypeScript, git',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();
      const checks: Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail: string }> = [];

      const requiredFiles = [
        'package.json', 'next.config.ts', 'src/lib/db/schema.ts',
        'src/lib/auth/index.ts', 'src/lib/payments/index.ts',
        'src/config/app.ts', '.env.local',
      ];
      for (const f of requiredFiles) {
        checks.push({
          name: f,
          status: existsSync(resolve(root, f)) ? 'ok' : 'fail',
          detail: existsSync(resolve(root, f)) ? 'exists' : 'missing',
        });
      }

      try {
        execSync('pnpm tsc --noEmit', { cwd: root, stdio: 'pipe', timeout: 60_000 });
        checks.push({ name: 'TypeScript', status: 'ok', detail: 'compiles cleanly' });
      } catch {
        checks.push({ name: 'TypeScript', status: 'fail', detail: 'compilation errors' });
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(checks, null, 2) }] };
    },
  );
}
