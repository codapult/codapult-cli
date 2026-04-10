import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  patchSchemaImports,
  patchSchemaTables,
  patchDbReExports,
  patchNextConfig,
  regenerateBarrel,
  createPluginRegistration,
  patchPages,
  patchEnvFile,
  patchPackageJson,
} from './patchers.js';
import type { PluginManifest } from './manifest.js';

vi.mock('node:fs');

const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, rmdirSync } =
  await import('node:fs');

const mockedExists = vi.mocked(existsSync);
const mockedRead = vi.mocked(readFileSync);
const mockedWrite = vi.mocked(writeFileSync);
const mockedMkdir = vi.mocked(mkdirSync);
const mockedReaddir = vi.mocked(readdirSync);
const mockedRm = vi.mocked(rmSync);
const mockedRmdir = vi.mocked(rmdirSync);

const ROOT = '/project';

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// patchSchemaImports
// ---------------------------------------------------------------------------

describe('patchSchemaImports', () => {
  const schemaBase = `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';\n\nexport const user = sqliteTable('user', {});`;

  it('adds new imports without duplicating existing ones', () => {
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(schemaBase);

    patchSchemaImports(ROOT, 'test-plugin', ['text', 'real', 'blob'], 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain(
      "import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';",
    );
  });

  it('does nothing when schema file does not exist', () => {
    mockedExists.mockReturnValue(false);

    patchSchemaImports(ROOT, 'test-plugin', ['real'], 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('removes imports not used outside the plugin block', () => {
    const content = `import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
});

// --- plugin:test-plugin:start ---
export const widget = sqliteTable('widget', {
  score: real('score'),
});
// --- plugin:test-plugin:end ---
`;
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchSchemaImports(ROOT, 'test-plugin', ['real'], 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).not.toMatch(/\breal\b.*from 'drizzle-orm\/sqlite-core'/);
    expect(written).toContain('sqliteTable');
    expect(written).toContain('text');
    expect(written).toContain('integer');
  });

  it('keeps imports that are used outside the plugin block', () => {
    const content = `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  count: integer('count'),
});

// --- plugin:test-plugin:start ---
export const widget = sqliteTable('widget', {
  n: integer('n'),
});
// --- plugin:test-plugin:end ---
`;
    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchSchemaImports(ROOT, 'test-plugin', ['integer'], 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain('integer');
  });
});

// ---------------------------------------------------------------------------
// patchSchemaTables
// ---------------------------------------------------------------------------

describe('patchSchemaTables', () => {
  it('appends table block with markers on add', () => {
    const schema = `import { sqliteTable, text } from 'drizzle-orm/sqlite-core';\n\nexport const user = sqliteTable('user', {});`;
    const tables = `import { sqliteTable, text } from 'drizzle-orm/sqlite-core';\n\nexport type Widget = typeof widget.$inferSelect;\n\nexport const widget = sqliteTable('widget', {});\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockImplementation((p) => {
      const path = p as string;
      if (path.includes('schema.ts')) return schema;
      return tables;
    });

    patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain('// --- plugin:test-plugin:start ---');
    expect(written).toContain('// --- plugin:test-plugin:end ---');
    expect(written).toContain("export const widget = sqliteTable('widget', {});");
    // The tables file's import and type export lines should be stripped from the injected block
    const markerBlock = written.slice(written.indexOf('// --- plugin:test-plugin:start ---'));
    expect(markerBlock).not.toMatch(/^import\s+/m);
    expect(markerBlock).not.toMatch(/^export\s+type\s+Widget/m);
    // The original schema import should still be present
    expect(written).toMatch(/^import\s+.*from\s+'drizzle-orm\/sqlite-core'/m);
  });

  it('skips if marker already present', () => {
    const schema = `// --- plugin:test-plugin:start ---\n// tables\n// --- plugin:test-plugin:end ---`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(schema);

    patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('removes marked block on remove', () => {
    const schema = `export const user = sqliteTable('user', {});\n\n// --- plugin:test-plugin:start ---\nexport const widget = sqliteTable('widget', {});\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(schema);

    patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).not.toContain('plugin:test-plugin');
    expect(written).not.toContain('widget');
    expect(written).toContain('user');
  });

  it('replaces marked block with new content on update', () => {
    const schema = `export const user = sqliteTable('user', {});\n\n// --- plugin:test-plugin:start ---\nexport const widget = sqliteTable('widget', {\n  id: text('id'),\n});\n// --- plugin:test-plugin:end ---\n`;
    const newTables = `export const widget = sqliteTable('widget', {\n  id: text('id'),\n  name: text('name'),\n});\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockImplementation((p) => {
      const path = p as string;
      if (path.includes('schema.ts')) return schema;
      return newTables;
    });

    const result = patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'update');

    expect(result).toBe(true);
    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("name: text('name')");
    expect(written).toContain('// --- plugin:test-plugin:start ---');
    expect(written).toContain('// --- plugin:test-plugin:end ---');
  });

  it('returns false on update when schema is unchanged', () => {
    const tables = `export const widget = sqliteTable('widget', {});`;
    const schema = `export const user = sqliteTable('user', {});\n\n// --- plugin:test-plugin:start ---\n${tables}\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockImplementation((p) => {
      const path = p as string;
      if (path.includes('schema.ts')) return schema;
      return tables + '\n';
    });

    const result = patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'update');

    expect(result).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('returns false on update when plugin is not installed', () => {
    const schema = `export const user = sqliteTable('user', {});`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(schema);

    const result = patchSchemaTables(ROOT, 'test-plugin', '/plugins/test', 'tables.ts', 'update');

    expect(result).toBe(false);
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchDbReExports
// ---------------------------------------------------------------------------

describe('patchDbReExports', () => {
  it('creates a new export line when none exists', () => {
    const content = `import { db } from './client';\n\nexport { db };\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchDbReExports(ROOT, 'test-plugin', ['widgetTable', 'gadgetTable'], 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("export { widgetTable, gadgetTable } from './schema';");
    expect(written).toContain('// --- plugin:test-plugin:start ---');
  });

  it('merges into existing export line', () => {
    const content = `export { userTable } from './schema';\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchDbReExports(ROOT, 'test-plugin', ['widgetTable'], 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("export { userTable, widgetTable } from './schema';");
  });

  it('skips symbols already exported', () => {
    const content = `export { userTable, widgetTable } from './schema';\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchDbReExports(ROOT, 'test-plugin', ['widgetTable'], 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    // Should add a comment-only marker, not duplicate the export
    expect(written).toContain('// --- plugin:test-plugin:start ---');
    expect(written).toContain('db re-exports handled by first plugin');
  });

  it('removes marked block on remove', () => {
    const content = `export { db } from './client';\n\n// --- plugin:test-plugin:start ---\nexport { widgetTable } from './schema';\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchDbReExports(ROOT, 'test-plugin', ['widgetTable'], 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).not.toContain('plugin:test-plugin');
    expect(written).not.toContain('widgetTable');
  });

  it('is idempotent — skips if marker already present', () => {
    const content = `// --- plugin:test-plugin:start ---\n// marker\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(content);

    patchDbReExports(ROOT, 'test-plugin', ['widgetTable'], 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchNextConfig
// ---------------------------------------------------------------------------

describe('patchNextConfig', () => {
  const makeManifest = (transpile: string[] = [], externals: string[] = []): PluginManifest => ({
    name: 'test-plugin',
    package: '@codapult/plugin-test',
    version: '0.1.0',
    description: 'Test',
    install: {
      transpilePackages: transpile,
      serverExternalPackages: externals,
    },
  });

  it('appends to existing transpilePackages array', () => {
    const config = `const nextConfig: NextConfig = {\n  transpilePackages: [\n    'existing-pkg',\n  ],\n  serverExternalPackages: [\n    'ext-pkg',\n  ],\n};`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(config);

    patchNextConfig(ROOT, 'test-plugin', makeManifest(['@codapult/plugin-test']), 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("'@codapult/plugin-test', // plugin:test-plugin");
  });

  it('creates transpilePackages when not present', () => {
    const config = `const nextConfig: NextConfig = {\n  output: 'standalone',\n};`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(config);

    patchNextConfig(ROOT, 'test-plugin', makeManifest(['@codapult/plugin-test']), 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain('transpilePackages: [');
    expect(written).toContain("'@codapult/plugin-test', // plugin:test-plugin");
  });

  it('removes per-entry markers on remove', () => {
    const config = `const nextConfig: NextConfig = {\n  transpilePackages: [\n    '@codapult/plugin-test', // plugin:test-plugin\n    'other-pkg',\n  ],\n};`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(config);

    patchNextConfig(ROOT, 'test-plugin', makeManifest(['@codapult/plugin-test']), 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).not.toContain('@codapult/plugin-test');
    expect(written).toContain('other-pkg');
  });

  it('does not duplicate entries on repeated add', () => {
    const config = `const nextConfig: NextConfig = {\n  transpilePackages: [\n    '@codapult/plugin-test', // plugin:test-plugin\n  ],\n};`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(config);

    patchNextConfig(ROOT, 'test-plugin', makeManifest(['@codapult/plugin-test']), 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    const occurrences = written.split('@codapult/plugin-test').length - 1;
    expect(occurrences).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// regenerateBarrel
// ---------------------------------------------------------------------------

describe('regenerateBarrel', () => {
  it('generates barrel with sorted imports', () => {
    mockedExists.mockReturnValue(true);
    mockedReaddir.mockReturnValue(['crm.ts', 'ai-kit.ts', 'index.ts'] as unknown as ReturnType<
      typeof readdirSync
    >);

    regenerateBarrel(ROOT);

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("import './ai-kit';");
    expect(written).toContain("import './crm';");
    expect(written).not.toContain('index');
    // ai-kit should come before crm (sorted)
    expect(written.indexOf('ai-kit')).toBeLessThan(written.indexOf('crm'));
  });

  it('does nothing when plugins dir does not exist', () => {
    mockedExists.mockReturnValue(false);

    regenerateBarrel(ROOT);

    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createPluginRegistration
// ---------------------------------------------------------------------------

describe('createPluginRegistration', () => {
  it('writes registration file on add', () => {
    mockedExists.mockImplementation((p) => {
      const path = p as string;
      if (path.includes('src/plugins')) return true;
      return false;
    });
    mockedReaddir.mockReturnValue(['test-plugin.ts'] as unknown as ReturnType<typeof readdirSync>);

    createPluginRegistration(ROOT, 'test-plugin', '@codapult/plugin-test', 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain("import { registerPlugin } from '@/lib/plugins';");
    expect(written).toContain("import plugin from '@codapult/plugin-test';");
    expect(written).toContain('registerPlugin(plugin);');
  });

  it('removes registration file and regenerates barrel on remove', () => {
    mockedExists.mockReturnValue(true);
    mockedReaddir.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    createPluginRegistration(ROOT, 'test-plugin', '@codapult/plugin-test', 'remove');

    expect(mockedRm).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchPages
// ---------------------------------------------------------------------------

describe('patchPages', () => {
  it('creates page files on add', () => {
    mockedExists.mockReturnValue(false);

    const pages = {
      'src/app/(dashboard)/dashboard/widgets/page.tsx': '@codapult/plugin-test/pages/widgets-page',
    };
    patchPages(ROOT, 'test-plugin', pages, 'add');

    expect(mockedMkdir).toHaveBeenCalled();
    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain(
      "export { default } from '@codapult/plugin-test/pages/widgets-page';",
    );
  });

  it('removes page files and cleans up empty dirs on remove', () => {
    mockedExists.mockReturnValue(true);
    mockedReaddir.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const pages = {
      'src/app/(dashboard)/dashboard/widgets/page.tsx': '@codapult/plugin-test/pages/widgets-page',
    };
    patchPages(ROOT, 'test-plugin', pages, 'remove');

    expect(mockedRm).toHaveBeenCalled();
    expect(mockedRmdir).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchEnvFile
// ---------------------------------------------------------------------------

describe('patchEnvFile', () => {
  it('appends env vars with markers on add', () => {
    const envContent = `APP_NAME=codapult\nSECRET=abc\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(envContent);

    const envVars = {
      PLUGIN_API_KEY: { default: '', required: true, description: 'API key for the plugin' },
      PLUGIN_URL: { default: 'http://localhost:3001', required: false },
    };

    patchEnvFile(ROOT, 'test-plugin', envVars, 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).toContain('// --- plugin:test-plugin:start ---');
    expect(written).toContain('# API key for the plugin');
    expect(written).toContain('PLUGIN_API_KEY=');
    expect(written).toContain('PLUGIN_URL=http://localhost:3001');
    expect(written).toContain('// --- plugin:test-plugin:end ---');
  });

  it('removes env block on remove', () => {
    const envContent = `APP_NAME=codapult\n\n// --- plugin:test-plugin:start ---\nPLUGIN_KEY=abc\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(envContent);

    patchEnvFile(ROOT, 'test-plugin', {}, 'remove');

    const written = mockedWrite.mock.calls[0][1] as string;
    expect(written).not.toContain('PLUGIN_KEY');
    expect(written).not.toContain('plugin:test-plugin');
    expect(written).toContain('APP_NAME=codapult');
  });

  it('is idempotent — skips if marker already present', () => {
    const envContent = `// --- plugin:test-plugin:start ---\nKEY=val\n// --- plugin:test-plugin:end ---\n`;

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(envContent);

    patchEnvFile(ROOT, 'test-plugin', { KEY: { required: true } }, 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('does nothing when .env.local does not exist', () => {
    mockedExists.mockReturnValue(false);

    patchEnvFile(ROOT, 'test-plugin', { KEY: { required: true } }, 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchPackageJson
// ---------------------------------------------------------------------------

describe('patchPackageJson', () => {
  it('adds dependency with file: protocol on add', () => {
    const pkg = JSON.stringify({ name: 'codapult', dependencies: { next: '16' } });

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(pkg);

    patchPackageJson(ROOT, 'test-plugin', '@codapult/plugin-test', '/plugins/test-plugin', 'add');

    const written = mockedWrite.mock.calls[0][1] as string;
    const parsed = JSON.parse(written) as Record<string, Record<string, string>>;
    expect(parsed.dependencies['@codapult/plugin-test']).toMatch(/^file:/);
    expect(parsed.dependencies.next).toBe('16');
  });

  it('removes dependency on remove', () => {
    const pkg = JSON.stringify({
      name: 'codapult',
      dependencies: { next: '16', '@codapult/plugin-test': 'file:../test-plugin' },
    });

    mockedExists.mockReturnValue(true);
    mockedRead.mockReturnValue(pkg);

    patchPackageJson(
      ROOT,
      'test-plugin',
      '@codapult/plugin-test',
      '/plugins/test-plugin',
      'remove',
    );

    const written = mockedWrite.mock.calls[0][1] as string;
    const parsed = JSON.parse(written) as Record<string, Record<string, string>>;
    expect(parsed.dependencies['@codapult/plugin-test']).toBeUndefined();
    expect(parsed.dependencies.next).toBe('16');
  });

  it('does nothing when package.json does not exist', () => {
    mockedExists.mockReturnValue(false);

    patchPackageJson(ROOT, 'test-plugin', '@codapult/plugin-test', '/plugins/test', 'add');

    expect(mockedWrite).not.toHaveBeenCalled();
  });
});
