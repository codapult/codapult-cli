import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectFile } from './project.js';
import { extractEnvSchemaKeys } from './env-schema-parser.js';
import { ENV_SCHEMA_KEYS } from './env-config.js';

export interface EnvSchemaCompatibility {
  status: 'ok' | 'warn' | 'fail';
  schemaPath: string;
  schemaKeys: string[];
  expectedKeys: string[];
  schemaOnly: string[];
  mirrorOnly: string[];
  message: string;
}

export function checkEnvSchemaCompatibility(root: string): EnvSchemaCompatibility {
  const schemaPath = 'src/config/env-schema.ts';
  const absolutePath = resolve(root, schemaPath);
  if (!existsSync(absolutePath)) {
    return {
      status: 'fail',
      schemaPath,
      schemaKeys: [],
      expectedKeys: [...ENV_SCHEMA_KEYS],
      schemaOnly: [],
      mirrorOnly: [...ENV_SCHEMA_KEYS],
      message: 'Environment schema is missing',
    };
  }

  const content = readProjectFile(root, schemaPath) ?? '';
  let schemaKeys: string[];
  try {
    schemaKeys = extractEnvSchemaKeys(content);
  } catch (error) {
    return {
      status: 'fail',
      schemaPath,
      schemaKeys: [],
      expectedKeys: [...ENV_SCHEMA_KEYS],
      schemaOnly: [],
      mirrorOnly: [...ENV_SCHEMA_KEYS],
      message: `Could not parse environment schema: ${String(error)}`,
    };
  }

  const actual = new Set(schemaKeys);
  const expected = new Set(ENV_SCHEMA_KEYS);
  const schemaOnly = schemaKeys.filter((key) => !expected.has(key));
  const mirrorOnly = ENV_SCHEMA_KEYS.filter((key) => !actual.has(key));
  const drift = schemaOnly.length > 0 || mirrorOnly.length > 0;
  return {
    status: drift ? 'warn' : 'ok',
    schemaPath,
    schemaKeys,
    expectedKeys: [...ENV_SCHEMA_KEYS],
    schemaOnly,
    mirrorOnly,
    message: drift
      ? `Environment schema drift detected (${schemaOnly.length} added, ${mirrorOnly.length} missing)`
      : `Environment schema is compatible (${schemaKeys.length} variables)`,
  };
}
