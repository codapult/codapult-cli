import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const ALLOWED_GIT_URL = /^(https?:\/\/|git@)/;

export interface CloneResult {
  pluginDir: string;
}

export function getCacheDir(projectRoot: string): string {
  return resolve(projectRoot, '.codapult', 'plugins');
}

/**
 * Derive a directory name from a git URL.
 *
 * Examples:
 *   git@github.com:org/codapult-plugin-onboarding.git → codapult-plugin-onboarding
 *   https://github.com/org/codapult-plugin-ai-kit     → codapult-plugin-ai-kit
 */
export function dirNameFromGitUrl(url: string): string {
  const last = url.split('/').pop() ?? url;
  return basename(last, '.git');
}

/**
 * Clone (or pull) a git repository into `.codapult/plugins/<dir>/` inside the
 * project root. If the directory already exists, runs `git pull` instead.
 *
 * @returns Absolute path to the cloned directory.
 * @throws  On git errors (no access, network, etc.).
 */
export function clonePlugin(projectRoot: string, gitUrl: string): CloneResult {
  if (!ALLOWED_GIT_URL.test(gitUrl)) {
    throw new Error(`Invalid git URL: "${gitUrl}". Only https:// and git@ URLs are allowed.`);
  }

  const dirName = dirNameFromGitUrl(gitUrl);
  const cacheDir = getCacheDir(projectRoot);
  const pluginDir = resolve(cacheDir, dirName);

  mkdirSync(cacheDir, { recursive: true });

  if (existsSync(resolve(pluginDir, '.git'))) {
    execSync('git pull --ff-only', { cwd: pluginDir, stdio: 'pipe' });
  } else {
    const result = spawnSync('git', ['clone', '--depth', '1', gitUrl, pluginDir], {
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      const stderr = result.stderr.toString().trim() || 'unknown error';
      throw new Error(`git clone failed: ${stderr}`);
    }
  }

  return { pluginDir };
}
