import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveManifest } from './manifest.js';

vi.mock('node:fs');

const { existsSync, readFileSync } = await import('node:fs');

const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);

const ROOT = '/project';

beforeEach(() => {
  vi.resetAllMocks();
});

const validManifest = JSON.stringify({
  name: 'test-plugin',
  package: '@codapult/plugin-test',
  version: '0.1.0',
  description: 'A test plugin',
  install: {},
});

describe('resolveManifest', () => {
  it('resolves manifest from direct path', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      return path === '/absolute/path/codapult-plugin.json';
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, '/absolute/path');

    expect(result).not.toBeNull();
    expect(result!.manifest.name).toBe('test-plugin');
    expect(result!.pluginDir).toBe('/absolute/path');
  });

  it('resolves manifest from sibling dir with codapult-plugin- prefix', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      return path === '/codapult-plugin-crm/codapult-plugin.json';
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, 'crm');

    expect(result).not.toBeNull();
    expect(result!.pluginDir).toContain('codapult-plugin-crm');
  });

  it('resolves manifest from sibling dir with codapult- prefix', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      // Direct path check fails, codapult-plugin- prefix fails, codapult- prefix succeeds
      if (path.includes('codapult-plugin-foo')) return false;
      return path === '/codapult-foo/codapult-plugin.json';
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, 'foo');

    expect(result).not.toBeNull();
  });

  it('resolves manifest from sibling dir with exact name', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      if (path.includes('codapult-plugin-bar') || path.includes('codapult-bar')) return false;
      return path === '/bar/codapult-plugin.json';
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, 'bar');

    expect(result).not.toBeNullable();
  });

  it('returns null when no manifest found', () => {
    mockedExists.mockReturnValue(false);

    const result = resolveManifest(ROOT, 'nonexistent');

    expect(result).toBeNullable();
  });

  it('resolves manifest from .codapult/plugins/ cache directory', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      return path === '/project/.codapult/plugins/codapult-plugin-cached/codapult-plugin.json';
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, 'cached');

    expect(result).not.toBeNull();
    expect(result!.pluginDir).toContain('.codapult/plugins/codapult-plugin-cached');
  });

  it('prefers .codapult/plugins/ cache over sibling directory', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      return (
        path === '/codapult-plugin-both/codapult-plugin.json' ||
        path === '/project/.codapult/plugins/codapult-plugin-both/codapult-plugin.json'
      );
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, 'both');

    expect(result).not.toBeNull();
    expect(result!.pluginDir).toBe('/project/.codapult/plugins/codapult-plugin-both');
  });

  it('returns null for invalid JSON manifest', () => {
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue('not valid json {{{');

    const result = resolveManifest(ROOT, 'broken');

    expect(result).toBeNullable();
  });

  it('returns null for a structurally invalid manifest', () => {
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(
      JSON.stringify({
        name: 'test-plugin',
        package: '@codapult/plugin-test',
        version: '0.1.0',
        description: 'A test plugin',
        install: { schemaTables: '../outside.ts', optionalDeps: { 'bad package': 'unsafe' } },
      }),
    );

    expect(resolveManifest(ROOT, 'broken')).toBeNullable();
  });

  it('prioritizes direct path over sibling directories', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      // Both direct path and sibling codapult-plugin- path have manifests
      return (
        path === '/direct/codapult-plugin.json' ||
        path === '/codapult-plugin-direct/codapult-plugin.json'
      );
    });
    mockedRead.mockReturnValue(validManifest);

    const result = resolveManifest(ROOT, '/direct');

    expect(result).not.toBeNull();
    expect(result!.pluginDir).toBe('/direct');
  });
});
