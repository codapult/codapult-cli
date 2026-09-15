import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkProjectRoot } from '../utils/project.js';
import { collectMcpHealth } from '../utils/health.js';
import { checkEnvSchemaCompatibility } from '../utils/env-compatibility.js';
import { heading, success, fail, info, dim } from '../utils/ui.js';
import { healthExitCode, renderHealthReport } from '../utils/health-render.js';

const PACKAGE_NAME = '@codapult/cli';
const DEFAULT_VERSION = 'latest';

interface McpConfig {
  mcpServers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

function getConfigPath(root: string): string {
  return resolve(root, '.cursor/mcp.json');
}

function resolveVersion(version?: string): string {
  if (version) return version;
  try {
    return execFileSync('npm', ['view', `${PACKAGE_NAME}@latest`, 'version'], {
      stdio: 'pipe',
      timeout: 30_000,
    })
      .toString()
      .trim();
  } catch {
    return DEFAULT_VERSION;
  }
}

export function mcpUpdateCommand(version?: string, options: { dryRun?: boolean } = {}): void {
  const root = checkProjectRoot('exit');

  const configPath = getConfigPath(root);
  const targetVersion = resolveVersion(version);
  const packageSpec = `${PACKAGE_NAME}@${targetVersion}`;
  const current = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, 'utf-8')) as McpConfig)
    : {};
  const next: McpConfig = {
    ...current,
    mcpServers: {
      ...(current.mcpServers ?? {}),
      codapult: {
        command: 'npx',
        args: ['-y', packageSpec, 'mcp-server'],
        cwd: '.',
      },
    },
  };

  heading('MCP Update');
  info(`Target: ${packageSpec}`);
  if (options.dryRun) {
    dim(`Would update ${configPath}`);
    return;
  }

  mkdirSync(resolve(root, '.cursor'), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  success(`Updated ${configPath}`);
  dim('Restart or reload the MCP connection in your editor to use the new version.');
}

export function mcpDoctorCommand(): void {
  const root = checkProjectRoot('exit');

  const report = collectMcpHealth(root);
  renderHealthReport('MCP Doctor', report);
  process.exitCode = healthExitCode(report);
}

export function mcpContractCheckCommand(): void {
  const root = checkProjectRoot('code');
  if (!root) return;

  const result = checkEnvSchemaCompatibility(root);
  heading('MCP Contract Check');
  if (result.status === 'ok') {
    success(result.message);
    return;
  }
  fail(result.message);
  if (result.schemaOnly.length > 0) {
    info('Variables present in env-schema.ts but missing from the CLI contract:');
    for (const key of result.schemaOnly) dim(`  + ${key}`);
  }
  if (result.mirrorOnly.length > 0) {
    info('Variables present in the CLI contract but missing from env-schema.ts:');
    for (const key of result.mirrorOnly) dim(`  - ${key}`);
  }
  process.exitCode = 1;
}
