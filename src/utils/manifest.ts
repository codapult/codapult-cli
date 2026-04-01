import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

export function resolveManifest(
  projectRoot: string,
  nameOrPath: string,
): { manifest: PluginManifest; pluginDir: string } | null {
  const candidates: string[] = [];

  if (existsSync(resolve(nameOrPath, MANIFEST_FILENAME))) {
    candidates.push(resolve(nameOrPath));
  }

  const parentDir = resolve(projectRoot, '..');
  candidates.push(
    join(parentDir, `codapult-plugin-${nameOrPath}`),
    join(parentDir, `codapult-${nameOrPath}`),
    join(parentDir, nameOrPath),
  );

  for (const dir of candidates) {
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
