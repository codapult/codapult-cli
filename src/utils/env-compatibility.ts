import { readProjectFile } from './project.js';
import { getProjectEnvSchemaKeys } from './project-env-schema.js';

export interface EnvSchemaCompatibility {
  status: 'ok' | 'warn' | 'fail';
  schemaPath: string;
  schemaKeys: string[];
  exampleKeys: string[];
  missingFromExample: string[];
  missingFromSchema: string[];
  message: string;
}

export function checkEnvSchemaCompatibility(root: string): EnvSchemaCompatibility {
  const schemaPath = 'src/config/env-schema.ts';
  let schemaKeys: string[];
  try {
    schemaKeys = getProjectEnvSchemaKeys(root);
  } catch (error) {
    return {
      status: 'fail',
      schemaPath,
      schemaKeys: [],
      exampleKeys: [],
      missingFromExample: [],
      missingFromSchema: [],
      message: `Could not load environment schema: ${String(error)}`,
    };
  }

  const exampleContent = readProjectFile(root, '.env.example') ?? '';
  const expectedKeys = [
    ...new Set(
      exampleContent
        .split(/\r?\n/)
        // A commented assignment still documents a supported variable in .env.example.
        .map((line) => /^\s*(?:#\s*)?(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
        .filter((key): key is string => key !== undefined),
    ),
  ];
  const schema = new Set(schemaKeys);
  const expected = new Set(expectedKeys);
  const missingFromExample = schemaKeys.filter((key) => !expected.has(key));
  const missingFromSchema = expectedKeys.filter((key) => !schema.has(key));
  const drift = missingFromExample.length > 0 || missingFromSchema.length > 0;
  return {
    status: drift ? 'warn' : 'ok',
    schemaPath,
    schemaKeys,
    exampleKeys: expectedKeys,
    missingFromExample,
    missingFromSchema,
    message: drift
      ? `Environment schema and .env.example differ (${missingFromExample.length} missing from the example, ${missingFromSchema.length} missing from the schema)`
      : `Environment schema matches .env.example (${schemaKeys.length} variables)`,
  };
}
