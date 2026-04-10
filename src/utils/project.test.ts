import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findProjectRoot, readJsonFile, projectFileExists, readProjectFile } from './project.js';

vi.mock('node:fs');

const { existsSync, readFileSync } = await import('node:fs');

const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// findProjectRoot
// ---------------------------------------------------------------------------

describe('findProjectRoot', () => {
  it('finds root by package name "codapult"', () => {
    mockedExists.mockImplementation((p) => {
      return (p as string) === '/home/user/projects/codapult/package.json';
    });
    mockedRead.mockReturnValue(JSON.stringify({ name: 'codapult' }));

    const root = findProjectRoot('/home/user/projects/codapult/src/lib');

    expect(root).toBe('/home/user/projects/codapult');
  });

  it('finds root by src/config/app.ts marker', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      if (path === '/project/package.json') return true;
      if (path === '/project/src/config/app.ts') return true;
      return false;
    });
    mockedRead.mockReturnValue(JSON.stringify({ name: 'my-saas' }));

    const root = findProjectRoot('/project/src/deep/nested');

    expect(root).toBe('/project');
  });

  it('finds root by codapult.plugins.ts marker', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      if (path === '/project/package.json') return true;
      if (path === '/project/codapult.plugins.ts') return true;
      return false;
    });
    mockedRead.mockReturnValue(JSON.stringify({ name: 'my-saas' }));

    const root = findProjectRoot('/project/src');

    expect(root).toBe('/project');
  });

  it('returns null when no project root found', () => {
    mockedExists.mockReturnValue(false);

    const root = findProjectRoot('/home/user/random');

    expect(root).toBeNull();
  });

  it('skips directories with invalid JSON in package.json', () => {
    let callCount = 0;
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      if (path === '/a/b/package.json') return true;
      if (path === '/a/package.json') return true;
      return false;
    });
    mockedRead.mockImplementation((_p) => {
      callCount += 1;
      if (callCount === 1) return 'invalid json';
      return JSON.stringify({ name: 'codapult' });
    });

    const root = findProjectRoot('/a/b/c');

    expect(root).toBe('/a');
  });
});

// ---------------------------------------------------------------------------
// readJsonFile
// ---------------------------------------------------------------------------

describe('readJsonFile', () => {
  it('parses valid JSON file', () => {
    mockedRead.mockReturnValue('{"key": "value", "num": 42}');

    const result = readJsonFile('/some/file.json');

    expect(result).toEqual({ key: 'value', num: 42 });
  });

  it('returns null for invalid JSON', () => {
    mockedRead.mockReturnValue('not json');

    const result = readJsonFile('/some/file.json');

    expect(result).toBeNull();
  });

  it('returns null when file does not exist', () => {
    mockedRead.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = readJsonFile('/nonexistent.json');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projectFileExists
// ---------------------------------------------------------------------------

describe('projectFileExists', () => {
  it('returns true when file exists', () => {
    mockedExists.mockReturnValue(true);

    expect(projectFileExists('/project', 'src/lib/db/schema.ts')).toBe(true);
  });

  it('returns false when file does not exist', () => {
    mockedExists.mockReturnValue(false);

    expect(projectFileExists('/project', 'nonexistent.ts')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readProjectFile
// ---------------------------------------------------------------------------

describe('readProjectFile', () => {
  it('reads file content when it exists', () => {
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue('file content here');

    const result = readProjectFile('/project', 'src/config.ts');

    expect(result).toBe('file content here');
  });

  it('returns null when file does not exist', () => {
    mockedExists.mockReturnValue(false);

    const result = readProjectFile('/project', 'missing.ts');

    expect(result).toBeNull();
  });
});
