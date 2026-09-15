import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fail } from './ui.js';
import { config } from './config.js';

/**
 * Walk upward from cwd to find the Codapult project root
 * (directory containing package.json with codapult-specific markers).
 */
export function findProjectRoot(from: string = process.cwd()): string | undefined {
  let dir = resolve(from);
  const root = resolve('/');

  while (dir !== root) {
    const pkg = resolve(dir, 'package.json');
    if (existsSync(pkg)) {
      const content = readFileSync(pkg, 'utf-8');
      try {
        const json = JSON.parse(content) as Record<string, unknown>;
        if (
          json.name === 'codapult' ||
          existsSync(resolve(dir, 'src/config/app.ts')) ||
          existsSync(resolve(dir, 'codapult.plugins.ts'))
        ) {
          return dir;
        }
      } catch {
        // Not valid JSON — skip
      }
    }
    dir = dirname(dir);
  }
  return undefined;
}

export function checkProjectRoot<T extends 'exit' | 'code' | 'throw'>(
  exit: T,
): T extends 'code' ? string | undefined : string {
  const root = findProjectRoot();
  if (!root) {
    const msg = `Not inside a ${config.projectName} project.`;
    if (exit === 'throw') throw new Error(msg);
    fail(msg);
    if (exit === 'exit') process.exit(1);
    else if (exit === 'code') process.exitCode = 1;
  }
  return root as T extends 'code' ? string | undefined : string;
}

/** Read and parse a JSON file, returning null on failure. */
export function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Check if a file exists relative to the project root. */
export function projectFileExists(projectRoot: string, relativePath: string): boolean {
  return existsSync(resolve(projectRoot, relativePath));
}

/** Read a file relative to the project root. */
export function readProjectFile(projectRoot: string, relativePath: string): string | undefined {
  const fullPath = resolve(projectRoot, relativePath);
  if (!existsSync(fullPath)) return undefined;
  return readFileSync(fullPath, 'utf-8');
}
