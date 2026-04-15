import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirNameFromGitUrl, clonePlugin } from './git.js';

vi.mock('node:child_process');
vi.mock('node:fs');

const { execSync } = await import('node:child_process');
const { existsSync, mkdirSync } = await import('node:fs');

const mockedExec = vi.mocked(execSync);
const mockedExists = vi.mocked(existsSync);
const mockedMkdir = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// dirNameFromGitUrl
// ---------------------------------------------------------------------------

describe('dirNameFromGitUrl', () => {
  it('extracts name from SSH URL with .git suffix', () => {
    expect(dirNameFromGitUrl('git@github.com:org/codapult-plugin-onboarding.git')).toBe(
      'codapult-plugin-onboarding',
    );
  });

  it('extracts name from HTTPS URL without .git suffix', () => {
    expect(dirNameFromGitUrl('https://github.com/org/codapult-plugin-ai-kit')).toBe(
      'codapult-plugin-ai-kit',
    );
  });

  it('handles URL with trailing slash', () => {
    expect(dirNameFromGitUrl('https://github.com/org/my-plugin.git')).toBe('my-plugin');
  });
});

// ---------------------------------------------------------------------------
// clonePlugin
// ---------------------------------------------------------------------------

describe('clonePlugin', () => {
  it('clones into .codapult/plugins/ when directory does not exist', () => {
    mockedExists.mockReturnValue(false);

    const result = clonePlugin('/project', 'git@github.com:org/codapult-plugin-test.git');

    expect(result.pluginDir).toBe('/project/.codapult/plugins/codapult-plugin-test');
    expect(mockedMkdir).toHaveBeenCalledWith('/project/.codapult/plugins', { recursive: true });
    expect(mockedExec).toHaveBeenCalledWith(
      expect.stringContaining('git clone --depth 1'),
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('runs git pull when .git directory already exists', () => {
    mockedExists.mockReturnValue(true);

    const result = clonePlugin('/project', 'git@github.com:org/codapult-plugin-test.git');

    expect(result.pluginDir).toBe('/project/.codapult/plugins/codapult-plugin-test');
    expect(mockedExec).toHaveBeenCalledWith(
      'git pull --ff-only',
      expect.objectContaining({
        cwd: '/project/.codapult/plugins/codapult-plugin-test',
      }),
    );
  });

  it('throws when git clone fails', () => {
    mockedExists.mockReturnValue(false);
    mockedExec.mockImplementation(() => {
      throw new Error('Permission denied (publickey)');
    });

    expect(() => clonePlugin('/project', 'git@github.com:org/private-plugin.git')).toThrow(
      'Permission denied',
    );
  });
});
