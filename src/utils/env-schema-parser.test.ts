import { describe, expect, it } from 'vitest';
import { extractEnvSchemaKeys } from './env-schema-parser.js';

describe('extractEnvSchemaKeys', () => {
  it('finds z.object keys through chained calls and comments', () => {
    expect(
      extractEnvSchemaKeys(`
        export const envSchema = z
          .object({ APP_MODE: z.string(), 'CUSTOM_KEY': z.string(), })
          .superRefine(() => {});
      `),
    ).toEqual(['APP_MODE', 'CUSTOM_KEY']);
  });
});
