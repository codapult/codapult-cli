import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ENV_FILE_NAME,
  getProjectEnvFilePath,
  getProjectEnvOptions,
  getProjectEnvSource,
  loadProjectEnv,
} from './project-env.js';

vi.mock('node:fs');

const { existsSync, readFileSync } = await import('node:fs');

const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('project-env', () => {
  it('defaults to file env source', () => {
    expect(getProjectEnvSource()).toBe('file');
  });

  it('uses process env source when envFile is disabled', () => {
    expect(getProjectEnvSource({ envFile: false })).toBe('process');
  });

  it('maps env source to options', () => {
    expect(getProjectEnvOptions('process')).toEqual({ envFile: false });
    expect(getProjectEnvOptions('file')).toEqual({ envFile: true });
    expect(getProjectEnvOptions()).toEqual({ envFile: true });
  });

  it(`loads env content from ${ENV_FILE_NAME} in file mode`, () => {
    mockedExists.mockImplementation((path) => path === `/project/${ENV_FILE_NAME}`);
    mockedRead.mockReturnValue('AUTH_PROVIDER=better-auth\nDB_PROVIDER=postgres');

    expect(loadProjectEnv('/project')).toEqual({
      source: 'file',
      content: 'AUTH_PROVIDER=better-auth\nDB_PROVIDER=postgres',
      filePath: `/project/${ENV_FILE_NAME}`,
      fileExists: true,
    });
  });

  it('loads env content from process.env in process mode', () => {
    mockedExists.mockReturnValue(false);
    vi.stubEnv('AUTH_PROVIDER', 'better-auth');
    vi.stubEnv('DB_PROVIDER', 'postgres');

    const env = loadProjectEnv('/project', { envFile: false });

    expect(env.source).toBe('process');
    expect(env.filePath).toBe(`/project/${ENV_FILE_NAME}`);
    expect(env.fileExists).toBe(false);
    expect(env.content).toContain('AUTH_PROVIDER=better-auth');
    expect(env.content).toContain('DB_PROVIDER=postgres');
  });

  it(`returns ${ENV_FILE_NAME} path helper`, () => {
    expect(getProjectEnvFilePath('/project')).toBe(`/project/${ENV_FILE_NAME}`);
  });
});
