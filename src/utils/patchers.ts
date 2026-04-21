import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, relative, basename, extname, join } from 'node:path';
import type { PluginManifest } from './manifest.js';

const MARKER_START = (name: string): string => `// --- plugin:${name}:start ---`;
const MARKER_END = (name: string): string => `// --- plugin:${name}:end ---`;

function hasMarker(content: string, name: string): boolean {
  return content.includes(MARKER_START(name));
}

function removeMarkedBlock(content: string, name: string): string {
  const start = MARKER_START(name);
  const end = MARKER_END(name);
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + end.length);
  const trimmedAfter = after.replace(/^\n{1,2}/, '\n');
  return before + trimmedAfter;
}

// ---------------------------------------------------------------------------
// schema.ts — add/remove schema imports and table definitions
// ---------------------------------------------------------------------------

export function patchSchemaImports(
  projectRoot: string,
  pluginName: string,
  imports: string[],
  action: 'add' | 'remove',
): void {
  const schemaPath = resolve(projectRoot, 'src/lib/db/schema.ts');
  if (!existsSync(schemaPath)) return;
  let content = readFileSync(schemaPath, 'utf-8');

  const importLine = /import\s*\{([^}]+)\}\s*from\s*['"]drizzle-orm\/sqlite-core['"];?/.exec(
    content,
  );
  if (!importLine) return;

  const existing = importLine[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (action === 'add') {
    for (const imp of imports) {
      if (!existing.includes(imp)) existing.push(imp);
    }
  } else {
    // Only remove import if no remaining plugin table blocks use it
    const contentWithoutThisPlugin = removeMarkedBlock(content, pluginName);
    for (const imp of imports) {
      const idx = existing.indexOf(imp);
      if (idx === -1) continue;
      // Check if the symbol is used outside the import line itself
      const usagePattern = new RegExp(`\\b${imp}\\b`);
      const contentAfterImport = contentWithoutThisPlugin.replace(importLine[0], '');
      if (!usagePattern.test(contentAfterImport)) {
        existing.splice(idx, 1);
      }
    }
  }

  const newImportLine = `import { ${existing.join(', ')} } from 'drizzle-orm/sqlite-core';`;
  content = content.replace(importLine[0], newImportLine);
  writeFileSync(schemaPath, content, 'utf-8');
}

function extractMarkedBlock(content: string, name: string): string | null {
  const start = MARKER_START(name);
  const end = MARKER_END(name);
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return null;
  return content.slice(startIdx + start.length, endIdx);
}

function readPluginTables(pluginDir: string, tablesFile: string): string | null {
  const resolvedPlugin = resolve(pluginDir);
  const tablesPath = resolve(pluginDir, tablesFile);

  const rel = relative(resolvedPlugin, tablesPath);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    throw new Error(`Path traversal detected: "${tablesFile}" resolves outside plugin directory`);
  }

  if (!existsSync(tablesPath)) return null;

  let tables = readFileSync(tablesPath, 'utf-8');
  // Strip import lines — host schema already has them
  tables = tables.replace(/^import\s+.*;\s*\n/gm, '');
  // Strip type/interface declarations
  tables = tables.replace(/^export\s+type\s+.*;\s*\n/gm, '');
  tables = tables.replace(/^(?:export\s+)?interface\s+\w+\s*\{[\s\S]*?\}\s*\n/gm, '');
  return tables.trim();
}

export function patchSchemaTables(
  projectRoot: string,
  pluginName: string,
  pluginDir: string,
  tablesFile: string,
  action: 'add' | 'remove' | 'update',
): boolean {
  const schemaPath = resolve(projectRoot, 'src/lib/db/schema.ts');
  if (!existsSync(schemaPath)) return false;
  let content = readFileSync(schemaPath, 'utf-8');

  if (action === 'remove') {
    content = removeMarkedBlock(content, pluginName);
    writeFileSync(schemaPath, content, 'utf-8');
    return true;
  }

  if (action === 'add' && hasMarker(content, pluginName)) return false;

  const tables = readPluginTables(pluginDir, tablesFile);
  if (!tables) return false;

  if (action === 'update') {
    if (!hasMarker(content, pluginName)) return false;
    const oldBlock = extractMarkedBlock(content, pluginName);
    if (oldBlock !== null && oldBlock.trim() === tables) return false;
    content = removeMarkedBlock(content, pluginName);
  }

  const block = `\n${MARKER_START(pluginName)}\n${tables}\n${MARKER_END(pluginName)}\n`;
  content = content.trimEnd() + '\n' + block;
  writeFileSync(schemaPath, content, 'utf-8');
  return true;
}

// ---------------------------------------------------------------------------
// db/index.ts — re-export tables for FK references
// ---------------------------------------------------------------------------

export function patchDbReExports(
  projectRoot: string,
  pluginName: string,
  symbols: string[],
  action: 'add' | 'remove',
): void {
  const dbIndexPath = resolve(projectRoot, 'src/lib/db/index.ts');
  if (!existsSync(dbIndexPath)) return;
  let content = readFileSync(dbIndexPath, 'utf-8');

  if (action === 'remove') {
    content = removeMarkedBlock(content, pluginName);
    writeFileSync(dbIndexPath, content, 'utf-8');
    return;
  }

  if (hasMarker(content, pluginName)) return;

  // Collect symbols already re-exported from './schema' by other plugins
  const existingExportMatch = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/schema['"];?/.exec(content);
  const alreadyExported = new Set<string>();
  if (existingExportMatch) {
    existingExportMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => alreadyExported.add(s));
  }

  // Only add symbols not already exported
  const newSymbols = symbols.filter((s) => !alreadyExported.has(s));
  const commentLine = `${MARKER_START(pluginName)}\n// db re-exports handled by first plugin that needed them\n${MARKER_END(pluginName)}`;

  if (newSymbols.length === 0) {
    // All needed symbols already exported — add an empty marker so remove knows this plugin was here
    content = content.trimEnd() + '\n\n' + commentLine + '\n';
  } else if (existingExportMatch) {
    // Merge into the existing export line
    const merged = [...alreadyExported, ...newSymbols];
    const newExportLine = `export { ${merged.join(', ')} } from './schema';`;
    content = content.replace(existingExportMatch[0], newExportLine);
    content = content.trimEnd() + '\n\n' + commentLine + '\n';
  } else {
    // No existing export — create a new one
    const exportLine = `export { ${symbols.join(', ')} } from './schema';`;
    const markedBlock = `${MARKER_START(pluginName)}\n${exportLine}\n${MARKER_END(pluginName)}`;
    content = content.trimEnd() + '\n\n' + markedBlock + '\n';
  }

  writeFileSync(dbIndexPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// next.config.ts — transpilePackages + serverExternalPackages
// ---------------------------------------------------------------------------

export function patchNextConfig(
  projectRoot: string,
  pluginName: string,
  manifest: PluginManifest,
  action: 'add' | 'remove',
): void {
  const configPath = resolve(projectRoot, 'next.config.ts');
  if (!existsSync(configPath)) return;
  let content = readFileSync(configPath, 'utf-8');

  const transpile = manifest.install.transpilePackages ?? [];
  const externals = manifest.install.serverExternalPackages ?? [];

  if (action === 'add') {
    if (transpile.length > 0) {
      const existingTranspile = /transpilePackages:\s*\[/.exec(content);
      if (existingTranspile) {
        // Append entries to existing array (with per-entry plugin markers)
        for (const pkg of transpile) {
          if (!content.includes(`'${pkg}'`)) {
            content = content.replace(
              /transpilePackages:\s*\[/,
              `transpilePackages: [\n    '${pkg}', // plugin:${pluginName}`,
            );
          }
        }
      } else {
        // Create a new transpilePackages array
        const transpileEntries = transpile
          .map((p) => `    '${p}', // plugin:${pluginName}`)
          .join('\n');
        const newBlock = `  transpilePackages: [\n${transpileEntries}\n  ],`;
        content = content.replace(
          /const nextConfig:\s*NextConfig\s*=\s*\{/,
          `const nextConfig: NextConfig = {\n${newBlock}`,
        );
      }
    }

    for (const pkg of externals) {
      if (!content.includes(`'${pkg}'`)) {
        content = content.replace(
          /serverExternalPackages:\s*\[/,
          `serverExternalPackages: [\n    '${pkg}', // plugin:${pluginName}`,
        );
      }
    }
  } else {
    // Remove lines with per-entry markers for this plugin
    const entryPattern = new RegExp(`^[ \\t]*'[^']*',?\\s*//\\s*plugin:${pluginName}\\s*\\n`, 'gm');
    content = content.replace(entryPattern, '');
    // Also remove old-style marker blocks for backward compatibility
    content = removeMarkedBlock(content, pluginName);
    for (const pkg of externals) {
      content = content.replace(
        new RegExp(`\\s*'${pkg.replace('/', '\\/')}',?\\s*(//[^\n]*)?`, 'g'),
        '',
      );
    }
    // Clean up empty transpilePackages array
    content = content.replace(/\s*transpilePackages:\s*\[\s*\],?\s*\n/g, '\n');
  }

  writeFileSync(configPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// src/plugins/ — barrel-based registration (variant B)
// ---------------------------------------------------------------------------

export function regenerateBarrel(projectRoot: string): void {
  const pluginsDir = resolve(projectRoot, 'src/plugins');
  if (!existsSync(pluginsDir)) return;

  const files = readdirSync(pluginsDir)
    .filter((f) => typeof f === 'string' && f.endsWith('.ts') && f !== 'index.ts')
    .sort();

  const imports = files.map((f: string) => `import './${f.replace('.ts', '')}';`).join('\n');
  const barrel = `// Auto-generated by @codapult/cli — do not edit manually\n${imports}${imports.length > 0 ? '\n' : ''}`;

  writeFileSync(resolve(pluginsDir, 'index.ts'), barrel, 'utf-8');
}

export function createPluginRegistration(
  projectRoot: string,
  pluginName: string,
  packageName: string,
  action: 'add' | 'remove',
): void {
  const pluginsDir = resolve(projectRoot, 'src/plugins');
  mkdirSync(pluginsDir, { recursive: true });

  const regFile = resolve(pluginsDir, `${pluginName}.ts`);

  if (action === 'remove') {
    if (existsSync(regFile)) {
      rmSync(regFile);
    }
  } else {
    const content = `import plugin from '${packageName}';\nimport { registerPlugin } from '@/lib/plugins';\n\nregisterPlugin(plugin);\n`;
    writeFileSync(regFile, content, 'utf-8');
  }

  regenerateBarrel(projectRoot);
}

// ---------------------------------------------------------------------------
// Page wrappers — create/remove re-export files
// ---------------------------------------------------------------------------

// Next.js default `pageExtensions`. Ordered by resolution priority — the first
// extension with an existing file wins at routing time, regardless of what the
// plugin manifest asked for. Used as a fallback when `next.config.*` cannot be
// parsed or does not declare a custom list.
const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs'] as const;

const NEXT_CONFIG_CANDIDATES = [
  'next.config.ts',
  'next.config.mts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
] as const;

const PAGE_EXT_NAME_RE = /^[a-z0-9]+$/i;

/**
 * Strip `//` line comments and `/* ... *\/` block comments from a JS/TS
 * source. Very rough — good enough so that commented-out `pageExtensions`
 * declarations do not confuse the extractor.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:/])\/\/[^\n]*/g, (_m, prefix: string) => prefix);
}

/**
 * Read `pageExtensions` declared in `next.config.*`. Falls back to the
 * Next.js defaults when no config exists, no explicit `pageExtensions` is
 * declared, or parsing fails for any reason.
 *
 * The parser is intentionally text-based: dynamically evaluating user
 * `next.config.ts` would drag in the whole Next/plugin graph and is far
 * beyond the CLI's remit.
 */
export function readPageExtensions(projectRoot: string): readonly string[] {
  for (const candidate of NEXT_CONFIG_CANDIDATES) {
    const configPath = resolve(projectRoot, candidate);
    if (!existsSync(configPath)) continue;

    let raw: string;
    try {
      raw = readFileSync(configPath, 'utf-8');
    } catch {
      continue;
    }

    const source = stripComments(raw);
    const match = /pageExtensions\s*[:=]\s*\[([\s\S]*?)\]/.exec(source);
    if (!match) return [...DEFAULT_PAGE_EXTENSIONS];

    const literals = [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)]
      .map((m) => m[1].trim().toLowerCase())
      .filter((ext) => PAGE_EXT_NAME_RE.test(ext));

    if (literals.length === 0) return [...DEFAULT_PAGE_EXTENSIONS];

    return Array.from(new Set(literals));
  }

  return [...DEFAULT_PAGE_EXTENSIONS];
}

const PAGE_BACKUP_SUFFIX = '.codapult-bak';

/**
 * Content of the stub file that `patchPages` writes. Kept in sync with
 * the writeFileSync call below so that conflict detection can distinguish
 * an auto-generated stub from hand-written page code.
 */
function makeStubContent(exportFrom: string): string {
  return `export { default } from '${exportFrom}';\n`;
}

const STUB_RE = /^\s*export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"];?\s*$/;

interface StubInfo {
  exportFrom: string;
}

function parseStub(content: string): StubInfo | null {
  const match = STUB_RE.exec(content.trim());
  if (!match) return null;
  return { exportFrom: match[1] };
}

function backupPathFor(filePath: string, pluginName: string): string {
  return `${filePath}${PAGE_BACKUP_SUFFIX}-${pluginName}`;
}

function restoreBackupsFor(projectRoot: string, pluginName: string, pagePath: string): string[] {
  const fullPath = resolve(projectRoot, pagePath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) return [];

  const stubBase = basename(fullPath, extname(fullPath));
  const suffix = `${PAGE_BACKUP_SUFFIX}-${pluginName}`;
  const restored: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(suffix)) continue;
    const originalName = entry.slice(0, -suffix.length);
    // Only restore siblings for the same page slot (e.g. page.*, layout.*).
    const originalBase = basename(originalName, extname(originalName));
    if (originalBase !== stubBase) continue;

    const src = join(dir, entry);
    const dst = join(dir, originalName);
    if (existsSync(dst)) {
      // The stub was replaced with something else since — leave the backup
      // in place rather than silently overwriting user code.
      continue;
    }
    try {
      renameSync(src, dst);
      restored.push(relative(projectRoot, dst));
    } catch {
      // Best-effort restore; ignore failures
    }
  }
  return restored;
}

export interface PageConflict {
  /** Path declared in the manifest (relative to project root). */
  pagePath: string;
  /** Conflicting sibling file that Next.js may resolve instead (absolute). */
  conflictPath: string;
  /** Same path, relative to project root (for logs). */
  conflictRel: string;
  /** The conflict is also at the exact manifest path (same extension). */
  isExactPath: boolean;
  /** Existing file is a plugin stub (auto-generated re-export). */
  isStub: boolean;
  /** Existing file is our own stub for the current plugin. */
  isOwnStub: boolean;
}

function collectConflictsForEntry(
  projectRoot: string,
  pagePath: string,
  exportFrom: string,
  extensions: readonly string[],
): PageConflict[] {
  const fullPath = resolve(projectRoot, pagePath);
  const dir = dirname(fullPath);
  const stubBase = basename(fullPath, extname(fullPath));
  const targetExt = extname(fullPath).slice(1);

  const conflicts: PageConflict[] = [];
  const expectedStub = makeStubContent(exportFrom);

  for (const ext of extensions) {
    const candidate = join(dir, `${stubBase}.${ext}`);
    if (!existsSync(candidate)) continue;

    let content: string;
    try {
      content = readFileSync(candidate, 'utf-8');
    } catch {
      continue;
    }

    const stub = parseStub(content);
    const isStub = stub !== null;
    const isOwnStub = isStub && (content === expectedStub || stub.exportFrom === exportFrom);
    const isExactPath = ext === targetExt;

    // Our own freshly-written stub is not a conflict. It's how idempotent
    // re-installs are supposed to look.
    if (isExactPath && isOwnStub) continue;

    conflicts.push({
      pagePath,
      conflictPath: candidate,
      conflictRel: relative(projectRoot, candidate),
      isExactPath,
      isStub,
      isOwnStub,
    });
  }

  return conflicts;
}

/**
 * Inspect the project tree and report every existing page file that would
 * collide with the stubs declared in `pages`. Includes collisions at the
 * exact manifest path AND at sibling paths with a different Next.js page
 * extension (e.g. `page.ts` vs `page.tsx`). Returns an empty array when
 * there is nothing to worry about.
 *
 * `pageExtensions` defaults to values read from `next.config.*`, falling
 * back to the Next.js built-in defaults. Tests or advanced callers can
 * pass an explicit list.
 */
export function findPageConflicts(
  projectRoot: string,
  pages: Record<string, string>,
  pageExtensions?: readonly string[],
): PageConflict[] {
  const exts = pageExtensions ?? readPageExtensions(projectRoot);
  const all: PageConflict[] = [];
  for (const [pagePath, exportFrom] of Object.entries(pages)) {
    all.push(...collectConflictsForEntry(projectRoot, pagePath, exportFrom, exts));
  }
  return all;
}

export interface PatchPagesOptions {
  /**
   * What to do when an existing page file would collide with the stub.
   * - 'backup' (default): rename the conflicting file to
   *   `<name>.codapult-bak-<plugin>` before writing the stub.
   * - 'fail': throw an Error listing the conflicts. Callers can catch and
   *   re-prompt, or re-throw to abort.
   */
  onConflict?: 'backup' | 'fail';
  /**
   * Override the list of page extensions considered when detecting
   * conflicts. Defaults to `pageExtensions` read from `next.config.*`
   * (Next.js defaults as fallback).
   */
  pageExtensions?: readonly string[];
}

export class PageConflictError extends Error {
  readonly conflicts: PageConflict[];
  constructor(conflicts: PageConflict[]) {
    super(
      `Page conflict${conflicts.length === 1 ? '' : 's'} detected: ${conflicts
        .map((c) => c.conflictRel)
        .join(', ')}`,
    );
    this.name = 'PageConflictError';
    this.conflicts = conflicts;
  }
}

export function patchPages(
  projectRoot: string,
  pluginName: string,
  pages: Record<string, string>,
  action: 'add' | 'remove',
  options: PatchPagesOptions = {},
): void {
  const strategy = options.onConflict ?? 'backup';

  if (action === 'remove') {
    for (const [pagePath] of Object.entries(pages)) {
      const fullPath = resolve(projectRoot, pagePath);

      if (existsSync(fullPath)) {
        rmSync(fullPath);
      }

      restoreBackupsFor(projectRoot, pluginName, pagePath);

      try {
        let dir = dirname(fullPath);
        const srcDir = resolve(projectRoot, 'src');
        while (dir !== srcDir && dir.length > srcDir.length) {
          const entries = readdirSync(dir);
          if (entries.length === 0) {
            rmdirSync(dir);
            dir = dirname(dir);
          } else {
            break;
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    return;
  }

  // action === 'add'
  const extensions = options.pageExtensions ?? readPageExtensions(projectRoot);

  const allConflicts: PageConflict[] = [];
  for (const [pagePath, exportFrom] of Object.entries(pages)) {
    allConflicts.push(...collectConflictsForEntry(projectRoot, pagePath, exportFrom, extensions));
  }

  // Plugin stubs (from us or other plugins) can be safely overwritten. Only
  // hand-written pages force us into conflict-resolution mode.
  const nonStubConflicts = allConflicts.filter((c) => !c.isStub);

  if (nonStubConflicts.length > 0 && strategy === 'fail') {
    throw new PageConflictError(nonStubConflicts);
  }

  for (const [pagePath, exportFrom] of Object.entries(pages)) {
    const fullPath = resolve(projectRoot, pagePath);
    const content = makeStubContent(exportFrom);

    const conflicts = collectConflictsForEntry(projectRoot, pagePath, exportFrom, extensions);

    for (const conflict of conflicts) {
      if (conflict.isStub) {
        // Drop sibling stubs at a different extension so Next.js does not
        // pick an older one. The target-path stub will be overwritten below.
        if (!conflict.isExactPath) {
          rmSync(conflict.conflictPath);
        }
        continue;
      }

      // Non-stub user code: move it aside.
      const backup = backupPathFor(conflict.conflictPath, pluginName);
      if (existsSync(backup)) {
        // A previous install already preserved the original — keep that
        // backup untouched and just remove the live file.
        rmSync(conflict.conflictPath);
      } else {
        renameSync(conflict.conflictPath, backup);
      }
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * Find every `*.codapult-bak-*` file below `src/app`. Used by `codapult
 * doctor` to surface orphaned backups left over after a failed install.
 */
export function findPageBackups(projectRoot: string): string[] {
  const root = resolve(projectRoot, 'src/app');
  if (!existsSync(root)) return [];

  const found: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        stack.push(full);
        continue;
      }
      if (entry.includes(PAGE_BACKUP_SUFFIX)) {
        found.push(relative(projectRoot, full));
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// .env.local — append env vars
// ---------------------------------------------------------------------------

export function patchEnvFile(
  projectRoot: string,
  pluginName: string,
  envVars: Record<string, { default?: string; required: boolean; description?: string }>,
  action: 'add' | 'remove',
): void {
  const envPath = resolve(projectRoot, '.env.local');
  if (!existsSync(envPath)) return;
  let content = readFileSync(envPath, 'utf-8');

  if (action === 'remove') {
    content = removeMarkedBlock(content, pluginName);
    writeFileSync(envPath, content, 'utf-8');
    return;
  }

  if (hasMarker(content, pluginName)) return;

  const lines: string[] = [];
  for (const [key, config] of Object.entries(envVars)) {
    if (config.description) lines.push(`# ${config.description}`);
    const value = config.default ?? '';
    lines.push(`${key}=${value}`);
  }

  const block = `\n${MARKER_START(pluginName)}\n${lines.join('\n')}\n${MARKER_END(pluginName)}\n`;
  content = content.trimEnd() + '\n' + block;
  writeFileSync(envPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// package.json — add/remove dependency
// ---------------------------------------------------------------------------

export function patchPackageJson(
  projectRoot: string,
  pluginName: string,
  packageName: string,
  pluginDir: string,
  action: 'add' | 'remove',
): void {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return;

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;

  if (action === 'add') {
    const relPath = relative(projectRoot, pluginDir);
    deps[packageName] = `file:${relPath}`;
  } else {
    Reflect.deleteProperty(deps, packageName);
  }

  pkg.dependencies = deps;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}
