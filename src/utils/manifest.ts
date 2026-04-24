import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, isAbsolute, relative } from 'node:path';

export interface PluginManifestEnvVar {
  default?: string;
  required: boolean;
  description?: string;
}

export interface PluginManifest {
  name: string;
  package: string;
  version: string;
  description: string;

  install: {
    schemaImports?: string[];
    dbReExports?: string[];
    schemaTables?: string;
    schemaTablesPg?: string;
    transpilePackages?: string[];
    serverExternalPackages?: string[];
    shadcnComponents?: string[];
    pages?: Record<string, string>;
    env?: Record<string, PluginManifestEnvVar>;
    optionalDeps?: Record<string, string>;
  };
}

const MANIFEST_FILENAME = 'codapult-plugin.json';

/**
 * Verifies the resolved directory stays within expected boundaries
 * (sibling of projectRoot or inside .codapult/plugins/).
 */
function isWithinAllowedScope(dir: string, projectRoot: string): boolean {
  const parentDir = resolve(projectRoot, '..');
  const cacheDir = resolve(projectRoot, '.codapult', 'plugins');

  const relToParent = relative(parentDir, dir);
  const relToCache = relative(cacheDir, dir);

  const isUnderParent = !relToParent.startsWith('..') && !isAbsolute(relToParent);
  const isUnderCache = !relToCache.startsWith('..') && !isAbsolute(relToCache);

  return isUnderParent || isUnderCache;
}

export function resolveManifest(
  projectRoot: string,
  nameOrPath: string,
): { manifest: PluginManifest; pluginDir: string } | null {
  const candidates: string[] = [];

  // 1. Absolute / relative path — only accept if it resolves within allowed scope
  if (isAbsolute(nameOrPath) || nameOrPath.includes('/') || nameOrPath.includes('\\')) {
    const resolved = resolve(nameOrPath);
    if (
      isWithinAllowedScope(resolved, projectRoot) &&
      existsSync(resolve(resolved, MANIFEST_FILENAME))
    ) {
      candidates.push(resolved);
    }
  }

  // 2. Local cache (.codapult/plugins/codapult-plugin-<name>, ../<name>)
  const cacheDir = join(projectRoot, '.codapult', 'plugins');
  candidates.push(
    join(cacheDir, `codapult-plugin-${nameOrPath}`),
    join(cacheDir, `codapult-${nameOrPath}`),
    join(cacheDir, nameOrPath),
  );

  // 3. Sibling directories (../codapult-plugin-<name>, ../codapult-<name>, ../<name>)
  const parentDir = resolve(projectRoot, '..');
  candidates.push(
    join(parentDir, `codapult-plugin-${nameOrPath}`),
    join(parentDir, `codapult-${nameOrPath}`),
    join(parentDir, nameOrPath),
  );

  for (const dir of candidates) {
    if (!isWithinAllowedScope(dir, projectRoot)) continue;

    const manifestPath = join(dir, MANIFEST_FILENAME);
    if (existsSync(manifestPath)) {
      try {
        const content = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(content) as PluginManifest;
        return { manifest, pluginDir: dir };
      } catch {
        // Invalid JSON
      }
    }
  }

  return null;
}
