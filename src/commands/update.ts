import { execFileSync } from 'node:child_process';
import { checkProjectRoot } from '../utils/project.js';
import { heading, success, fail, warn, info, dim, confirm, label } from '../utils/ui.js';

const UPSTREAM_REMOTE = 'codapult-upstream';
const UPSTREAM_URL = 'https://github.com/codapult/codapult.git';

interface UpdateOptions {
  dryRun?: boolean;
  list?: boolean;
}

function runGit(args: string[], cwd: string, silent = false): string {
  const stdio = silent ? 'pipe' : 'inherit';
  const result = execFileSync('git', args, { cwd, encoding: 'utf-8', stdio });
  return typeof result === 'string' ? result : '';
}

function execQuiet(args: string[], cwd: string): string {
  try {
    return runGit(args, cwd, true).trim();
  } catch {
    return '';
  }
}

function isSafeGitRef(value: string): boolean {
  return (
    /^[A-Za-z0-9._/@-]+$/.test(value) &&
    !value.startsWith('-') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    !value.includes('@{')
  );
}

function hasUncommittedChanges(cwd: string): boolean {
  const status = execQuiet(['status', '--porcelain'], cwd);
  return status.length > 0;
}

function ensureUpstreamRemote(cwd: string): void {
  const remotes = execQuiet(['remote'], cwd);
  if (!remotes.split('\n').includes(UPSTREAM_REMOTE)) {
    info(`Adding upstream remote "${UPSTREAM_REMOTE}"...`);
    runGit(['remote', 'add', UPSTREAM_REMOTE, UPSTREAM_URL], cwd, true);
    success(`Remote "${UPSTREAM_REMOTE}" added`);
  }
}

function fetchUpstream(cwd: string): void {
  info('Fetching upstream releases...');
  execQuiet(['fetch', UPSTREAM_REMOTE, '--tags'], cwd);
}

function getAvailableTags(cwd: string): string[] {
  const raw = execQuiet(['tag', '-l', 'v*', '--sort=-v:refname'], cwd);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

function getCurrentVersion(cwd: string): string {
  const tag = execQuiet(['describe', '--tags', '--abbrev=0'], cwd);
  return tag || '(no version tag)';
}

function getConflictFiles(cwd: string): string[] {
  const raw = execQuiet(['diff', '--name-only', '--diff-filter=U'], cwd);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

export async function updateCommand(
  version: string | undefined,
  options: UpdateOptions,
): Promise<void> {
  const root = checkProjectRoot('exit');

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

  if (!isSafeGitRef(target)) {
    fail(`Invalid version or Git ref: ${target}`);
    process.exit(1);
  }

  label('Target version', target);
  console.log();

  if (options.dryRun) {
    info('Dry run — showing changes without applying:');
    console.log();
    const currentRef = isSafeGitRef(current) ? current : 'HEAD';
    try {
      runGit(['log', '--oneline', `${currentRef}..${UPSTREAM_REMOTE}/${target}`], root);
    } catch {
      runGit(['log', '--oneline', `..${target}`], root);
    }
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
    runGit(['merge', target, '--no-edit'], root);
    success('Update merged successfully!');
  } catch {
    warn('Merge conflicts detected.');
    console.log();

    const conflicts = getConflictFiles(root);
    if (conflicts.length > 0) {
      info('Files requiring manual conflict resolution:');
      for (const file of conflicts) dim(`  ${file}`);
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
