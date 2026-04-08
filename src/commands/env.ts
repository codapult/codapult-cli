import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, info, dim, warn, confirm } from '../utils/ui.js';

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

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
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

export async function envCheckCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Environment Check');

  const examplePath = resolve(root, '.env.example');
  const localPath = resolve(root, '.env.local');

  if (!existsSync(examplePath)) {
    fail('.env.example not found');
    process.exit(1);
  }

  if (!existsSync(localPath)) {
    fail('.env.local not found — run: cp .env.example .env.local');
    process.exit(1);
  }

  const exampleEntries = parseEnvFile(readFileSync(examplePath, 'utf-8'));
  const localContent = readFileSync(localPath, 'utf-8');
  const localEntries = parseEnvFile(localContent);
  const localKeys = new Set(localEntries.map((e) => e.key));

  const requiredKeys = exampleEntries.filter((e) => e.required);
  let missing = 0;
  let empty = 0;

  for (const entry of requiredKeys) {
    if (!localKeys.has(entry.key)) {
      fail(`Missing: ${entry.key}${entry.comment ? ` — ${entry.comment}` : ''}`);
      missing++;
    } else {
      const local = localEntries.find((e) => e.key === entry.key);
      if (local && (!local.value || local.value === entry.value)) {
        const isPlaceholder = /^(your-|generate-|https?:\/\/your|""?)/.test(local.value);
        if (isPlaceholder || !local.value) {
          warn(`Not configured: ${entry.key}${entry.comment ? ` — ${entry.comment}` : ''}`);
          empty++;
        }
      }
    }
  }

  const extra = localEntries.filter((e) => !exampleEntries.some((ex) => ex.key === e.key));
  if (extra.length > 0) {
    console.log();
    info(`${extra.length} extra variable(s) in .env.local (not in .env.example):`);
    for (const e of extra) {
      dim(`  ${e.key}`);
    }
  }

  console.log();
  if (missing === 0 && empty === 0) {
    success('All required variables are configured');
  } else {
    if (missing > 0) fail(`${missing} missing variable(s)`);
    if (empty > 0) warn(`${empty} variable(s) need configuration`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// codapult env sync
// ---------------------------------------------------------------------------

export async function envSyncCommand(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  heading('Sync .env.local with .env.example');

  const examplePath = resolve(root, '.env.example');
  const localPath = resolve(root, '.env.local');

  if (!existsSync(examplePath)) {
    fail('.env.example not found');
    process.exit(1);
  }

  if (!existsSync(localPath)) {
    info('.env.local does not exist — creating from .env.example');
    const content = readFileSync(examplePath, 'utf-8');
    writeFileSync(localPath, content, 'utf-8');
    success('Created .env.local');
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

  info(`${newEntries.length} new variable(s) found in .env.example:`);
  for (const e of newEntries) {
    dim(`  ${e.key}=${e.value}${e.comment ? `  # ${e.comment}` : ''}`);
  }

  const proceed = await confirm(`Add ${newEntries.length} variable(s) to .env.local?`);
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
  success(`Added ${newEntries.length} variable(s) to .env.local`);
  console.log();
}
