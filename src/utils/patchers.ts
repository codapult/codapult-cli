import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import type { PluginManifest } from './manifest.js';

const MARKER_START = (name: string) => `// --- plugin:${name}:start ---`;
const MARKER_END = (name: string) => `// --- plugin:${name}:end ---`;

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

  const importLine = content.match(
    /import\s*\{([^}]+)\}\s*from\s*['"]drizzle-orm\/sqlite-core['"];?/,
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

export function patchSchemaTables(
  projectRoot: string,
  pluginName: string,
  pluginDir: string,
  tablesFile: string,
  action: 'add' | 'remove',
): void {
  const schemaPath = resolve(projectRoot, 'src/lib/db/schema.ts');
  if (!existsSync(schemaPath)) return;
  let content = readFileSync(schemaPath, 'utf-8');

  if (action === 'remove') {
    content = removeMarkedBlock(content, pluginName);
    writeFileSync(schemaPath, content, 'utf-8');
    return;
  }

  if (hasMarker(content, pluginName)) return;

  const tablesPath = resolve(pluginDir, tablesFile);
  if (!existsSync(tablesPath)) return;

  let tables = readFileSync(tablesPath, 'utf-8');

  // Strip import lines — host schema already has them
  tables = tables.replace(/^import\s+.*;\s*\n/gm, '');
  // Strip type exports
  tables = tables.replace(/^export\s+type\s+.*;\s*\n/gm, '');
  tables = tables.trim();

  const block = `\n${MARKER_START(pluginName)}\n${tables}\n${MARKER_END(pluginName)}\n`;
  content = content.trimEnd() + '\n' + block;
  writeFileSync(schemaPath, content, 'utf-8');
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
  const existingExportMatch = content.match(/export\s*\{([^}]+)\}\s*from\s*['"]\.\/schema['"];?/);
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
      const existingTranspile = content.match(/transpilePackages:\s*\[/);
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
    const content = `import { registerPlugin } from '@/lib/plugins';\nimport plugin from '${packageName}';\n\nregisterPlugin(plugin);\n`;
    writeFileSync(regFile, content, 'utf-8');
  }

  regenerateBarrel(projectRoot);
}

export function regenerateBarrel(projectRoot: string): void {
  const pluginsDir = resolve(projectRoot, 'src/plugins');
  if (!existsSync(pluginsDir)) return;

  const files = readdirSync(pluginsDir)
    .filter((f) => typeof f === 'string' && f.endsWith('.ts') && f !== 'index.ts')
    .sort();

  const imports = files.map((f: string) => `import './${f.replace('.ts', '')}';`).join('\n');
  const barrel = `// Auto-generated by @codapult/cli — do not edit manually\n${imports}\n`;

  writeFileSync(resolve(pluginsDir, 'index.ts'), barrel, 'utf-8');
}

// ---------------------------------------------------------------------------
// Page wrappers — create/remove re-export files
// ---------------------------------------------------------------------------

export function patchPages(
  projectRoot: string,
  pluginName: string,
  pages: Record<string, string>,
  action: 'add' | 'remove',
): void {
  for (const [pagePath, exportFrom] of Object.entries(pages)) {
    const fullPath = resolve(projectRoot, pagePath);

    if (action === 'remove') {
      if (existsSync(fullPath)) {
        rmSync(fullPath);
      }
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
      continue;
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    const content = `export { default } from '${exportFrom}';\n`;
    writeFileSync(fullPath, content, 'utf-8');
  }
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
    delete deps[packageName];
  }

  pkg.dependencies = deps;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}
