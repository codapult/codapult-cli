import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ProjectEnvSource = 'file' | 'process';

export interface ProjectEnvOptions {
  envFile?: boolean;
}

export interface LoadedProjectEnv {
  source: ProjectEnvSource;
  content: string;
  filePath: string;
  fileExists: boolean;
}

export const ENV_EXAMPLE_FILE_NAME = '.env.example';
export const ENV_FILE_NAME = '.env.local';

export function getProjectEnvFilePath(projectRoot: string): string {
  return resolve(projectRoot, ENV_FILE_NAME);
}

export function getProjectEnvSource(options?: ProjectEnvOptions): ProjectEnvSource {
  return options?.envFile === false ? 'process' : 'file';
}

export function getProjectEnvOptions(envSource?: ProjectEnvSource): ProjectEnvOptions {
  return envSource === 'process' ? { envFile: false } : { envFile: true };
}

function serializeProcessEnv(env: NodeJS.ProcessEnv): string {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function loadProjectEnv(projectRoot: string, options?: ProjectEnvOptions): LoadedProjectEnv {
  const source = getProjectEnvSource(options);
  const filePath = getProjectEnvFilePath(projectRoot);
  const fileExists = existsSync(filePath);

  if (source === 'process') {
    return {
      source,
      content: serializeProcessEnv(process.env),
      filePath,
      fileExists,
    };
  }

  return {
    source,
    content: fileExists ? readFileSync(filePath, 'utf-8') : '',
    filePath,
    fileExists,
  };
}
