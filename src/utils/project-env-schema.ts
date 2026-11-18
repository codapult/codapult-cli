import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { z } from 'zod';

const ENV_SCHEMA_PATH = 'src/config/env-schema.ts';
const APP_CONFIG_PATH = 'src/config/app.ts';
const OAUTH_PROVIDERS_PATH = 'src/lib/auth/oauth-providers.ts';
const projectModules = new Map<string, object>();

interface ProjectEnvSchemaModule {
  createEnvSchema(
    environment?: NodeJS.ProcessEnv,
    options?: {
      skipRuntimeChecks?: boolean;
      defaults?: ProjectAppConfig;
    },
  ): z.ZodObject<z.ZodRawShape>;
}

interface ProjectAppConfig {
  appName: string;
  appUrl: string;
  currency: string;
  reverseProxyUrl?: string;
}

interface ProjectAppConfigModule {
  createAppConfig(environment?: NodeJS.ProcessEnv): ProjectAppConfig;
}

/**
 * Load the env schema from the Codapult project, transpiling its TypeScript
 * source in memory so the CLI can validate the exact source used by the app.
 */
export function loadProjectEnvSchema(root: string): ProjectEnvSchemaModule {
  // Function declarations are hoisted; keep the source-loading implementation below its API.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return loadProjectSourceModule(
    root,
    ENV_SCHEMA_PATH,
    (loaded): loaded is ProjectEnvSchemaModule =>
      typeof (loaded as Partial<ProjectEnvSchemaModule>).createEnvSchema === 'function',
  );
}

export function loadProjectAppConfig(root: string): ProjectAppConfigModule {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return loadProjectSourceModule(
    root,
    APP_CONFIG_PATH,
    (loaded): loaded is ProjectAppConfigModule =>
      typeof (loaded as Partial<ProjectAppConfigModule>).createAppConfig === 'function',
  );
}

interface ProjectOAuthProvidersModule {
  oauthCredentialKeys: Record<string, [string, string]>;
}

export function loadProjectOAuthProviders(root: string): ProjectOAuthProvidersModule {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return loadProjectSourceModule(
    root,
    OAUTH_PROVIDERS_PATH,
    (loaded): loaded is ProjectOAuthProvidersModule => {
      const credentials = (loaded as Partial<ProjectOAuthProvidersModule>).oauthCredentialKeys;
      return typeof credentials === 'object' && credentials !== null;
    },
  );
}

function loadProjectSourceModule<T extends object>(
  root: string,
  relativePath: string,
  isExpectedModule: (loaded: object) => loaded is T,
): T {
  const sourcePath = resolve(root, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Required project source is missing: ${relativePath}`);
  }
  const cached = projectModules.get(sourcePath);
  if (cached) {
    if (!isExpectedModule(cached))
      throw new Error(`${relativePath} does not export expected values`);
    return cached;
  }

  const absoluteRoot = resolve(root);
  const projectRequire = createRequire(resolve(absoluteRoot, 'package.json'));
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (!specifier.startsWith('.') || extname(specifier)) throw error;
        const resolved = nextResolve(`${specifier}.ts`, context);
        if (
          resolved.url.startsWith('file:') &&
          !fileURLToPath(resolved.url).startsWith(`${absoluteRoot}/`)
        ) {
          throw error;
        }
        return resolved;
      }
    },
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context);

      const filename = fileURLToPath(url);
      const source = readFileSync(filename, 'utf8');
      const output = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText;
      return { format: 'commonjs', source: output, shortCircuit: true };
    },
  });
  try {
    const loaded: unknown = projectRequire(sourcePath);
    if (typeof loaded !== 'object' || loaded === null || !isExpectedModule(loaded)) {
      throw new Error(`${relativePath} does not export the expected values`);
    }
    projectModules.set(sourcePath, loaded);
    return loaded;
  } catch (error) {
    throw new Error(`Could not load project source ${relativePath}: ${String(error)}`, {
      cause: error,
    });
  } finally {
    hooks.deregister();
  }
}

export function getProjectEnvSchema(
  root: string,
  environment: NodeJS.ProcessEnv = {},
): z.ZodObject<z.ZodRawShape> {
  const defaults = loadProjectAppConfig(root).createAppConfig(environment);
  const schema = loadProjectEnvSchema(root).createEnvSchema(environment, {
    skipRuntimeChecks: true,
    defaults,
  });
  return schema;
}

export function getProjectEnvSchemaKeys(root: string): string[] {
  return Object.keys(getProjectEnvSchema(root).shape);
}

/** Parse the simple KEY=value format used by the project's env files. */
export function parseProjectEnv(content: string): NodeJS.ProcessEnv {
  const values: NodeJS.ProcessEnv = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('`') && value.endsWith('`')))
    ) {
      value = value.slice(1, -1);
      if (rawValue.startsWith('"')) value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[key] = value.trim().length > 0 ? value : undefined;
  }
  return values;
}
