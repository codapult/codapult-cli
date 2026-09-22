import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join, isAbsolute, relative } from 'node:path';
import { z } from 'zod';
import { getCacheDir } from './git.js';

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
    schemaImportsPg?: string[];
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

const nonEmptyString = z.string().trim().min(1);
const packageName = z.string().regex(/^@?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/);
const relativePluginPath = nonEmptyString.refine(
  (value) => !isAbsolute(value) && !value.split(/[\\/]+/).includes('..'),
  'Plugin paths must stay inside the plugin directory',
);

const pluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  package: packageName,
  version: nonEmptyString,
  description: z.string(),
  install: z
    .object({
      schemaImports: z.array(nonEmptyString).optional(),
      schemaImportsPg: z.array(nonEmptyString).optional(),
      dbReExports: z.array(nonEmptyString).optional(),
      schemaTables: relativePluginPath.optional(),
      schemaTablesPg: relativePluginPath.optional(),
      transpilePackages: z.array(packageName).optional(),
      serverExternalPackages: z.array(packageName).optional(),
      shadcnComponents: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).optional(),
      // Keys are project-relative page paths; values are package import specifiers.
      pages: z.record(nonEmptyString, nonEmptyString).optional(),
      env: z
        .record(
          z.string().regex(/^[A-Z][A-Z0-9_]*$/),
          z.object({
            default: z.string().optional(),
            required: z.boolean(),
            description: z.string().optional(),
          }),
        )
        .optional(),
      optionalDeps: z.record(packageName, z.string()).optional(),
    })
    .default({}),
});

function realPathOrOriginal(path: string): string {
  try {
    const resolved = realpathSync(path);
    return typeof resolved === 'string' ? resolved : path;
  } catch {
    return path;
  }
}

/**
 * Verifies the resolved directory stays within expected boundaries
 * (sibling of projectRoot or inside .codapult/plugins/).
 */
function isWithinAllowedScope(dir: string, projectRoot: string): boolean {
  const parentDir = resolve(projectRoot, '..');
  const cacheDir = getCacheDir(projectRoot);
  const resolvedDir = existsSync(dir) ? realPathOrOriginal(dir) : dir;
  const resolvedParent = existsSync(parentDir) ? realPathOrOriginal(parentDir) : parentDir;
  const resolvedCache = existsSync(cacheDir) ? realPathOrOriginal(cacheDir) : cacheDir;

  const relToParent = relative(resolvedParent, resolvedDir);
  const relToCache = relative(resolvedCache, resolvedDir);

  const isUnderParent = !relToParent.startsWith('..') && !isAbsolute(relToParent);
  const isUnderCache = !relToCache.startsWith('..') && !isAbsolute(relToCache);

  return isUnderParent || isUnderCache;
}

export function resolveManifest(
  projectRoot: string,
  nameOrPath: string,
): { manifest: PluginManifest; pluginDir: string } | undefined {
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
  const cacheDir = getCacheDir(projectRoot);
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
        const parsed = pluginManifestSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          return { manifest: parsed.data, pluginDir: dir };
        }
      } catch {
        // Invalid JSON
      }
    }
  }

  return undefined;
}
