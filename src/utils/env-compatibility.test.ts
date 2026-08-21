import { describe, expect, it, vi } from 'vitest';
import { checkEnvSchemaCompatibility } from './env-compatibility.js';

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('./project.js', () => ({ readProjectFile: vi.fn() }));

const { readProjectFile } = await import('./project.js');
const mockedRead = vi.mocked(readProjectFile);

describe('checkEnvSchemaCompatibility', () => {
  it('reports a compatible host schema', async () => {
    const { ENV_SCHEMA_KEYS } = await import('./env-config.js');
    mockedRead.mockReturnValue(
      `export const envSchema = z.object({ ${ENV_SCHEMA_KEYS.map((key) => `${key}: z.string()`).join(', ')} });`,
    );
    const result = checkEnvSchemaCompatibility('/project');
    expect(result.status).toBe('ok');
    expect(result.schemaOnly).toEqual([]);
    expect(result.mirrorOnly).toEqual([]);
  });

  it('reports variables added to or removed from the host schema', () => {
    mockedRead.mockReturnValue(
      'export const envSchema = z.object({ APP_MODE: z.string(), NEW_KEY: z.string() });',
    );
    const result = checkEnvSchemaCompatibility('/project');
    expect(result.status).toBe('warn');
    expect(result.schemaOnly).toEqual(['NEW_KEY']);
    expect(result.mirrorOnly.length).toBeGreaterThan(0);
  });
});
