import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirNameFromGitUrl, clonePlugin } from './git.js';

vi.mock('node:child_process');
vi.mock('node:fs');

const { execSync, spawnSync } = await import('node:child_process');
const { existsSync, mkdirSync } = await import('node:fs');

const mockedExec = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawnSync);
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
    expect(dirNameFromGitUrl('https://github.com/org/codapult-plugin-crm')).toBe(
      'codapult-plugin-crm',
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
    mockedSpawn.mockReturnValue({
      status: 0,
      stderr: Buffer.from(''),
      stdout: Buffer.from(''),
      pid: 0,
      signal: null,
      output: [],
    });

    const result = clonePlugin('/project', 'git@github.com:org/codapult-plugin-test.git');

    expect(result.pluginDir).toBe('/project/.codapult/plugins/codapult-plugin-test');
    expect(mockedMkdir).toHaveBeenCalledWith('/project/.codapult/plugins', { recursive: true });
    expect(mockedSpawn).toHaveBeenCalledWith(
      'git',
      [
        'clone',
        '--depth',
        '1',
        'git@github.com:org/codapult-plugin-test.git',
        '/project/.codapult/plugins/codapult-plugin-test',
      ],
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
    mockedSpawn.mockReturnValue({
      status: 128,
      stderr: Buffer.from('Permission denied (publickey)'),
      stdout: Buffer.from(''),
      pid: 0,
      signal: null,
      output: [],
    });

    expect(() => clonePlugin('/project', 'git@github.com:org/private-plugin.git')).toThrow(
      'Permission denied',
    );
  });

  it('rejects URLs that are not https:// or git@', () => {
    expect(() => clonePlugin('/project', 'file:///etc/passwd')).toThrow('Invalid git URL');
    expect(() => clonePlugin('/project', '/some/local/path')).toThrow('Invalid git URL');
  });
});
