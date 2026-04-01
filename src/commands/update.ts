import { execSync } from 'node:child_process';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, warn, info, dim, confirm, label } from '../utils/ui.js';

const UPSTREAM_REMOTE = 'codapult-upstream';
const UPSTREAM_URL = 'https://github.com/AstronautSaaS/codapult.git';

interface UpdateOptions {
  dryRun?: boolean;
  list?: boolean;
}

function exec(cmd: string, cwd: string, silent = false): string {
  const stdio = silent ? 'pipe' : 'inherit';
  const result = execSync(cmd, { cwd, encoding: 'utf-8', stdio });
  return typeof result === 'string' ? result : '';
}

function execQuiet(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }).toString().trim();
  } catch {
    return '';
  }
}

function hasUncommittedChanges(cwd: string): boolean {
  const status = execQuiet('git status --porcelain', cwd);
  return status.length > 0;
}

function ensureUpstreamRemote(cwd: string): void {
  const remotes = execQuiet('git remote', cwd);
  if (!remotes.split('\n').includes(UPSTREAM_REMOTE)) {
    info(`Adding upstream remote "${UPSTREAM_REMOTE}"...`);
    execQuiet(`git remote add ${UPSTREAM_REMOTE} ${UPSTREAM_URL}`, cwd);
    success(`Remote "${UPSTREAM_REMOTE}" added`);
  }
}

function fetchUpstream(cwd: string): void {
  info('Fetching upstream releases...');
  execQuiet(`git fetch ${UPSTREAM_REMOTE} --tags`, cwd);
}

function getAvailableTags(cwd: string): string[] {
  const raw = execQuiet(`git tag -l "v*" --sort=-v:refname`, cwd);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

function getCurrentVersion(cwd: string): string {
  const tag = execQuiet('git describe --tags --abbrev=0 2>/dev/null', cwd);
  return tag || '(no version tag)';
}

const SAFE_ZONE_PATTERNS = [
  'src/config/app.ts',
  'src/config/navigation.ts',
  'src/config/marketing.ts',
  'src/app/globals.css',
  'messages/',
  'content/',
  '.env',
];

function classifyConflicts(cwd: string): { safe: string[]; caution: string[]; core: string[] } {
  const raw = execQuiet('git diff --name-only --diff-filter=U', cwd);
  if (!raw) return { safe: [], caution: [], core: [] };

  const files = raw.split('\n').filter(Boolean);
  const safe: string[] = [];
  const caution: string[] = [];
  const core: string[] = [];

  for (const file of files) {
    if (SAFE_ZONE_PATTERNS.some((p) => file.startsWith(p))) {
      safe.push(file);
    } else if (file === 'pnpm-lock.yaml' || file === 'package.json' || file.endsWith('schema.ts')) {
      caution.push(file);
    } else {
      core.push(file);
    }
  }

  return { safe, caution, core };
}

export async function updateCommand(version: string | undefined, options: UpdateOptions): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    fail('Not inside a Codapult project.');
    process.exit(1);
  }

  ensureUpstreamRemote(root);
  fetchUpstream(root);

  const tags = getAvailableTags(root);

  if (options.list) {
    heading('Available versions');
    const current = getCurrentVersion(root);
    label('Current', current);
    console.log();
    if (tags.length === 0) {
      dim('No release tags found upstream.');
    } else {
      for (const tag of tags) {
        const marker = tag === current ? ' ← current' : '';
        dim(`  ${tag}${marker}`);
      }
    }
    console.log();
    return;
  }

  heading('Codapult Update');

  const current = getCurrentVersion(root);
  label('Current version', current);

  if (hasUncommittedChanges(root)) {
    fail('You have uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }

  const target = version ?? tags[0];
  if (!target) {
    fail('No target version found. Run with --list to see available versions.');
    process.exit(1);
  }

  label('Target version', target);
  console.log();

  if (options.dryRun) {
    info('Dry run — showing changes without applying:');
    console.log();
    exec(`git log --oneline ${current}..${UPSTREAM_REMOTE}/${target} 2>/dev/null || git log --oneline ..${target} 2>/dev/null`, root);
    console.log();
    dim('Run without --dry-run to apply the update.');
    return;
  }

  const proceed = await confirm(`Merge ${target} into your current branch?`);
  if (!proceed) {
    info('Update cancelled.');
    return;
  }

  info(`Merging ${target}...`);
  console.log();

  try {
    exec(`git merge ${target} --no-edit`, root);
    success('Update merged successfully!');
  } catch {
    warn('Merge conflicts detected.');
    console.log();

    const { safe, caution, core } = classifyConflicts(root);

    if (safe.length > 0) {
      info('Safe-zone conflicts (keep YOUR version):');
      for (const f of safe) dim(`  ${f}`);
      console.log();
    }

    if (caution.length > 0) {
      warn('Caution-zone conflicts (review carefully):');
      for (const f of caution) {
        dim(`  ${f}`);
        if (f === 'pnpm-lock.yaml') {
          dim('    → Resolve: accept either side, then run pnpm install');
        } else if (f.endsWith('schema.ts')) {
          dim('    → Resolve: merge both column additions, then pnpm db:push');
        }
      }
      console.log();
    }

    if (core.length > 0) {
      info('Core conflicts (review the upstream changes):');
      for (const f of core) dim(`  ${f}`);
      console.log();
    }

    info('After resolving conflicts:');
    dim('  1. git add .');
    dim('  2. git commit');
    dim('  3. pnpm install');
    dim('  4. pnpm db:push  (if schema changed)');
    dim('  5. pnpm build    (verify everything works)');
  }

  console.log();
}
