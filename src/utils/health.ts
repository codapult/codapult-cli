import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageBackups, findPageConflicts } from './patchers.js';
import { resolveManifest } from './manifest.js';
import { findProjectRoot, readJsonFile } from './project.js';
import { getProjectEnvOptions, loadProjectEnv, type ProjectEnvSource } from './project-env.js';
import { findProviderIssues, getAdapters, readEnvVar } from './env-config.js';
import { runProjectCommand, type CommandResult } from './command.js';
import { checkEnvSchemaCompatibility } from './env-compatibility.js';
import { compareSchemaFiles } from './schema-parity.js';
import { parseDatabaseSchema } from './schema-parser.js';

export type HealthStatus = 'ok' | 'warn' | 'fail';

export interface HealthCheck {
  id: string;
  status: HealthStatus;
  message: string;
  path?: string;
  details?: unknown;
}

export interface ProjectHealthReport {
  root: string;
  status: HealthStatus;
  checks: HealthCheck[];
  summary: { ok: number; warnings: number; failures: number };
}

export interface ProjectHealthOptions {
  envSource?: ProjectEnvSource;
  includeCommands?: boolean;
}

function commandCheck(id: string, result: CommandResult, message: string): HealthCheck {
  return {
    id,
    status: result.passed ? 'ok' : 'fail',
    message: result.passed ? message : `${message}: ${result.stderr || result.stdout}`.trim(),
    details: result,
  };
}

function finalizeReport(root: string, checks: HealthCheck[]): ProjectHealthReport {
  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warnings: checks.filter((check) => check.status === 'warn').length,
    failures: checks.filter((check) => check.status === 'fail').length,
  };
  const status: HealthStatus = summary.failures > 0 ? 'fail' : summary.warnings > 0 ? 'warn' : 'ok';
  return { root, status, checks, summary };
}

export function collectProjectHealth(
  root: string = findProjectRoot() ?? process.cwd(),
  options: ProjectHealthOptions = {},
): ProjectHealthReport {
  const checks: HealthCheck[] = [];
  const add = (check: HealthCheck): void => {
    checks.push(check);
  };
  const file = (id: string, path: string, label: string, required = true): void => {
    const present = existsSync(resolve(root, path));
    add({
      id,
      status: present ? 'ok' : required ? 'fail' : 'warn',
      message: present ? `${label} exists` : `${label} is missing`,
      path,
    });
  };

  const pkg = readJsonFile(resolve(root, 'package.json'));
  file('package', 'package.json', 'package.json');
  file('next-config', 'next.config.ts', 'Next.js config');
  file('app-config', 'src/config/app.ts', 'App config');
  file('env-schema', 'src/config/env-schema.ts', 'Environment schema');
  file('navigation-config', 'src/config/navigation.ts', 'Navigation config', false);

  const envCompatibility = checkEnvSchemaCompatibility(root);
  add({
    id: 'env-schema-compatibility',
    status: envCompatibility.status,
    message: envCompatibility.message,
    path: envCompatibility.schemaPath,
    details: envCompatibility,
  });

  const env = loadProjectEnv(root, getProjectEnvOptions(options.envSource));
  add({
    id: 'env-file',
    status: env.source === 'process' || env.fileExists ? 'ok' : 'fail',
    message:
      env.source === 'process'
        ? 'Using process.env'
        : env.fileExists
          ? '.env.local exists'
          : '.env.local is missing',
    path: env.filePath,
  });

  const adapters = getAdapters(env.content);
  add({
    id: 'effective-config',
    status: 'ok',
    message: 'Effective providers and feature configuration resolved',
    details: {
      adapters,
      appMode: readEnvVar(env.content, 'APP_MODE') ?? 'app',
    },
  });
  const schemaPath =
    adapters.database === 'postgres' ? 'src/lib/db/schema-pg.ts' : 'src/lib/db/schema.ts';
  file('database-schema', schemaPath, `Active database schema (${adapters.database})`);
  const sqliteSchemaPath = resolve(root, 'src/lib/db/schema.ts');
  const postgresSchemaPath = resolve(root, 'src/lib/db/schema-pg.ts');
  if (existsSync(sqliteSchemaPath) && existsSync(postgresSchemaPath)) {
    const parity = compareSchemaFiles(
      parseDatabaseSchema(readFileSync(sqliteSchemaPath, 'utf-8') ?? ''),
      parseDatabaseSchema(readFileSync(postgresSchemaPath, 'utf-8') ?? ''),
    );
    if (parity.differences.length === 0) {
      add({
        id: 'database-schema-parity',
        status: 'ok',
        message: 'SQLite and PostgreSQL schemas match',
        path: 'src/lib/db/schema.ts ↔ src/lib/db/schema-pg.ts',
      });
    } else {
      for (const [index, difference] of parity.differences.entries()) {
        add({
          id: `database-schema-parity-${index + 1}`,
          status: difference.severity,
          message: `${difference.table}: ${difference.issue}${difference.details !== undefined ? ` ${JSON.stringify(difference.details)}` : ''}`,
          path: 'src/lib/db/schema.ts ↔ src/lib/db/schema-pg.ts',
          details: difference,
        });
      }
    }
  } else {
    add({
      id: 'database-schema-parity-files',
      status: 'fail',
      message: 'Both SQLite and PostgreSQL schema files are required for parity checking',
      path: 'src/lib/db/schema.ts ↔ src/lib/db/schema-pg.ts',
    });
  }
  file('auth-module', 'src/lib/auth/index.ts', 'Auth module', adapters.auth !== 'none');
  file('payments-module', 'src/lib/payments/index.ts', 'Payments module');
  file('plugin-registry', 'codapult.plugins.ts', 'Plugin registry', false);

  for (const issue of findProviderIssues(env.content)) {
    add({
      id: `env-${issue.key.toLowerCase()}`,
      status: issue.severity === 'error' ? 'fail' : 'warn',
      message: issue.message,
      details: { key: issue.key, severity: issue.severity },
    });
  }
  if (!readEnvVar(env.content, 'NEXT_PUBLIC_APP_URL')) {
    add({
      id: 'env-app-url',
      status: 'warn',
      message: 'NEXT_PUBLIC_APP_URL is not set; defaults to http://localhost:3000',
    });
  }

  const nodeModulesPath = resolve(root, 'node_modules');
  add({
    id: 'dependencies',
    status: existsSync(nodeModulesPath) ? 'ok' : 'fail',
    message: existsSync(nodeModulesPath) ? 'node_modules exists' : 'node_modules is missing',
    path: 'node_modules',
  });

  if (options.includeCommands !== false) {
    const node = runProjectCommand('node --version', root, { timeout: 15_000 });
    const nodeMajor = Number.parseInt(node.stdout.replace(/^v/, ''), 10);
    add({
      id: 'node-version',
      status: node.passed && nodeMajor >= 20 ? 'ok' : 'fail',
      message: node.passed
        ? `Node.js ${node.stdout.trim()} (requires v20+)`
        : 'Node.js is not available',
      details: node,
    });
    add(
      commandCheck(
        'pnpm-version',
        runProjectCommand('pnpm --version', root, { timeout: 15_000 }),
        'pnpm is available',
      ),
    );
    add(
      commandCheck(
        'typecheck',
        runProjectCommand('pnpm type-check', root, { timeout: 120_000 }),
        'TypeScript compiles cleanly',
      ),
    );
  }

  const pluginsDir = resolve(root, 'src/plugins');
  const plugins = existsSync(pluginsDir)
    ? readdirSync(pluginsDir)
        .filter((fileName) => fileName.endsWith('.ts') && fileName !== 'index.ts')
        .map((fileName) => fileName.replace('.ts', ''))
    : [];
  for (const plugin of plugins) {
    const resolved = resolveManifest(root, plugin);
    if (!resolved?.manifest.install.pages) continue;
    const conflicts = findPageConflicts(root, resolved.manifest.install.pages).filter(
      (conflict) => !conflict.isStub,
    );
    if (conflicts.length > 0) {
      add({
        id: `plugin-${plugin}-pages`,
        status: 'fail',
        message: `${plugin} has ${conflicts.length} page conflict(s)`,
        details: conflicts,
      });
    }
  }
  const backups = findPageBackups(root);
  if (backups.length > 0) {
    add({
      id: 'plugin-backups',
      status: 'warn',
      message: `${backups.length} plugin page backup file(s) found`,
      details: backups,
    });
  }

  if (pkg) {
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, string>),
      ...((pkg.devDependencies ?? {}) as Record<string, string>),
    };
    add({
      id: 'key-packages',
      status: 'ok',
      message: 'Key package versions detected',
      details: Object.fromEntries(
        ['next', 'react', 'typescript', 'drizzle-orm', 'tailwindcss', 'better-auth']
          .filter((name) => deps[name])
          .map((name) => [name, deps[name]]),
      ),
    });
  }

  const git = runProjectCommand('git status --porcelain', root, { timeout: 15_000 });
  if (git.passed) {
    add({
      id: 'git-status',
      status: git.stdout.trim() ? 'warn' : 'ok',
      message: git.stdout.trim()
        ? `${git.stdout.trim().split('\n').length} uncommitted change(s)`
        : 'Working tree is clean',
      details: git.stdout.trim(),
    });
  }
  const remotes = runProjectCommand('git remote', root, { timeout: 15_000 });
  if (remotes.passed) {
    add({
      id: 'upstream-remote',
      status: remotes.stdout.split('\n').includes('codapult-upstream') ? 'ok' : 'warn',
      message: remotes.stdout.split('\n').includes('codapult-upstream')
        ? 'Codapult upstream remote is configured'
        : 'Codapult upstream remote is not configured; run `codapult update` when needed',
      details: remotes.stdout.trim(),
    });
  }

  return finalizeReport(root, checks);
}

/** Project health plus checks specific to the editor-facing MCP installation. */
export function collectMcpHealth(
  root: string = findProjectRoot() ?? process.cwd(),
  options: ProjectHealthOptions = {},
): ProjectHealthReport {
  const report = collectProjectHealth(root, options);
  const checks = [...report.checks];
  const configPath = '.cursor/mcp.json';
  const config = readJsonFile(resolve(root, configPath));
  if (!config) {
    checks.push({
      id: 'mcp-config',
      status: 'fail',
      message: 'MCP config is missing or invalid',
      path: configPath,
    });
    return finalizeReport(root, checks);
  }

  const server = (config.mcpServers as Record<string, unknown> | undefined)?.codapult;
  const command =
    typeof server === 'object' && server !== null ? (server as Record<string, unknown>) : undefined;
  const args = Array.isArray(command?.args) ? command.args.map(String) : [];
  const valid =
    command?.command === 'npx' &&
    args.includes('mcp-server') &&
    args.some((arg) => arg.includes('@codapult/cli@'));
  checks.push({
    id: 'mcp-config',
    status: valid ? 'ok' : 'fail',
    message: valid
      ? 'MCP config points to @codapult/cli'
      : 'MCP config has no valid Codapult server entry',
    path: configPath,
    details: { command: command?.command, args, cwd: command?.cwd },
  });
  return finalizeReport(root, checks);
}
