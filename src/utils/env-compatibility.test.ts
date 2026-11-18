import { describe, expect, it, vi } from 'vitest';
import { checkEnvSchemaCompatibility } from './env-compatibility.js';

vi.mock('./project.js', () => ({ readProjectFile: vi.fn() }));
vi.mock('./project-env-schema.js', () => ({ getProjectEnvSchemaKeys: vi.fn() }));

const { readProjectFile } = await import('./project.js');
const { getProjectEnvSchemaKeys } = await import('./project-env-schema.js');
const mockedRead = vi.mocked(readProjectFile);
const mockedSchemaKeys = vi.mocked(getProjectEnvSchemaKeys);

describe('checkEnvSchemaCompatibility', () => {
  it('reports matching schema and env example keys', () => {
    mockedSchemaKeys.mockReturnValue(['APP_MODE', 'NEW_KEY']);
    mockedRead.mockReturnValue('APP_MODE=full\nNEW_KEY=value\n');
    const result = checkEnvSchemaCompatibility('/project');
    expect(result.status).toBe('ok');
    expect(result.missingFromExample).toEqual([]);
    expect(result.missingFromSchema).toEqual([]);
  });

  it('reports variables added to or removed from the env example', () => {
    mockedSchemaKeys.mockReturnValue(['APP_MODE', 'NEW_KEY']);
    mockedRead.mockReturnValue('APP_MODE=full\nOLD_KEY=value\n');
    const result = checkEnvSchemaCompatibility('/project');
    expect(result.status).toBe('warn');
    expect(result.missingFromExample).toEqual(['NEW_KEY']);
    expect(result.missingFromSchema).toEqual(['OLD_KEY']);
  });
});
