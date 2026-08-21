import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  getProjectEnvSource,
  loadProjectEnv,
  type ProjectEnvOptions,
} from '../utils/project-env.js';
import { heading, success, fail, info, dim, warn, confirm } from '../utils/ui.js';
import { renderStructuredReport, summarizeChecks } from '../utils/check-report.js';

interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
  required: boolean;
}

function parseEnvFile(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  let lastComment = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') && !trimmed.startsWith('# ---') && !trimmed.startsWith('# ===')) {
      lastComment = trimmed.slice(1).trim();
      continue;
    }

    const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(trimmed);
    if (match) {
      entries.push({
        key: match[1],
        value: match[2],
        comment: lastComment || undefined,
        required: !line.startsWith('#'),
      });
      lastComment = '';
    } else {
      lastComment = '';
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// codapult env check
// ---------------------------------------------------------------------------

export function envCheckCommand(options: ProjectEnvOptions = {}): void {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  const examplePath = resolve(root, ENV_EXAMPLE_FILE_NAME);
  const localPath = resolve(root, ENV_FILE_NAME);

  if (!existsSync(examplePath)) {
    fail(`${ENV_EXAMPLE_FILE_NAME} not found`);
    process.exit(1);
  }

  const env = loadProjectEnv(root, options);

  if (env.source === 'file' && !existsSync(localPath)) {
    fail(`${ENV_FILE_NAME} not found — run: cp ${ENV_EXAMPLE_FILE_NAME} ${ENV_FILE_NAME}`);
    process.exit(1);
  }

  const exampleEntries = parseEnvFile(readFileSync(examplePath, 'utf-8'));
  const localContent = env.content;
  const localEntries = parseEnvFile(localContent);
  const localKeys = new Set(localEntries.map((e) => e.key));

  const requiredKeys = exampleEntries.filter((e) => e.required);
  const checks: {
    id: string;
    status: 'ok' | 'warn' | 'fail';
    message: string;
  }[] = [];

  for (const entry of requiredKeys) {
    if (!localKeys.has(entry.key)) {
      checks.push({
        id: entry.key,
        status: 'fail',
        message: `Missing: ${entry.key}${entry.comment ? ` — ${entry.comment}` : ''}`,
      });
    } else {
      const local = localEntries.find((e) => e.key === entry.key);
      if (local && (!local.value || local.value === entry.value)) {
        const isPlaceholder = /^(your-|generate-|https?:\/\/your|""?)/.test(local.value);
        if (isPlaceholder || !local.value) {
          checks.push({
            id: entry.key,
            status: 'warn',
            message: `Not configured: ${entry.key}${entry.comment ? ` — ${entry.comment}` : ''}`,
          });
        } else {
          checks.push({ id: entry.key, status: 'ok', message: `${entry.key} configured` });
        }
      } else {
        checks.push({ id: entry.key, status: 'ok', message: `${entry.key} configured` });
      }
    }
  }

  const extra = localEntries.filter((e) => !exampleEntries.some((ex) => ex.key === e.key));
  if (extra.length > 0) {
    console.log();
    const envLabel = env.source === 'process' ? 'process.env' : ENV_FILE_NAME;
    info(`${extra.length} extra variable(s) in ${envLabel} (not in ${ENV_EXAMPLE_FILE_NAME}):`);
    for (const e of extra) {
      dim(`  ${e.key}`);
    }
  }

  const report = summarizeChecks(checks);
  renderStructuredReport('Environment Check', report);
  process.exitCode = report.summary.failures > 0 ? 1 : 0;
  console.log();
}

// ---------------------------------------------------------------------------
// codapult env sync
// ---------------------------------------------------------------------------

export async function envSyncCommand(options: ProjectEnvOptions = {}): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading(`Sync ${ENV_FILE_NAME} with ${ENV_EXAMPLE_FILE_NAME}`);

  if (getProjectEnvSource(options) === 'process') {
    warn(`\`codapult env sync --no-env-file\` cannot update process.env`);
    dim(`Use this command without \`--no-env-file\` to manage ${ENV_FILE_NAME}.`);
    console.log();
    return;
  }

  const examplePath = resolve(root, ENV_EXAMPLE_FILE_NAME);
  const localPath = resolve(root, ENV_FILE_NAME);

  if (!existsSync(examplePath)) {
    fail(`${ENV_EXAMPLE_FILE_NAME} not found`);
    process.exit(1);
  }

  if (!existsSync(localPath)) {
    info(`${ENV_FILE_NAME} does not exist — creating from ${ENV_EXAMPLE_FILE_NAME}`);
    const content = readFileSync(examplePath, 'utf-8');
    writeFileSync(localPath, content, 'utf-8');
    success(`Created ${ENV_FILE_NAME}`);
    return;
  }

  const exampleEntries = parseEnvFile(readFileSync(examplePath, 'utf-8'));
  const localContent = readFileSync(localPath, 'utf-8');
  const localEntries = parseEnvFile(localContent);
  const localKeys = new Set(localEntries.map((e) => e.key));

  const newEntries = exampleEntries.filter((e) => e.required && !localKeys.has(e.key));

  if (newEntries.length === 0) {
    success('Already in sync — no new variables to add');
    console.log();
    return;
  }

  info(`${newEntries.length} new variable(s) found in ${ENV_EXAMPLE_FILE_NAME}:`);
  for (const e of newEntries) {
    dim(`  ${e.key}=${e.value}${e.comment ? `  # ${e.comment}` : ''}`);
  }

  const proceed = await confirm(`Add ${newEntries.length} variable(s) to ${ENV_FILE_NAME}?`);
  if (!proceed) {
    info('Cancelled.');
    return;
  }

  let appendContent = '\n';
  for (const e of newEntries) {
    if (e.comment) appendContent += `# ${e.comment}\n`;
    appendContent += `${e.key}=${e.value}\n`;
  }

  writeFileSync(localPath, localContent.trimEnd() + appendContent, 'utf-8');
  success(`Added ${newEntries.length} variable(s) to ${ENV_FILE_NAME}`);
  console.log();
}
