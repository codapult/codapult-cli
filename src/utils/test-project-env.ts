import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Write the minimal app-owned env source modules required by CLI integration fixtures. */
export function writeProjectEnvSources(root: string): void {
  mkdirSync(join(root, 'src/config'), { recursive: true });
  mkdirSync(join(root, 'src/lib/auth'), { recursive: true });
  writeFileSync(
    join(root, 'src/config/app.ts'),
    [
      'export function createAppConfig(environment = {}) {',
      "  const appUrl = environment.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';",
      '  return {',
      "    appName: environment.NEXT_PUBLIC_APP_NAME ?? 'codapult',",
      '    appUrl,',
      "    currency: environment.NEXT_PUBLIC_APP_CURRENCY ?? 'USD',",
      '    reverseProxyUrl: environment.NEXT_PUBLIC_APP_PROXY_URL,',
      '  };',
      '}',
      'export const appConfig = createAppConfig();',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src/config/env-schema.ts'),
    [
      'const keys = [',
      "  'APP_MODE', 'DB_PROVIDER', 'AUTH_PROVIDER', 'PAYMENT_PROVIDER',",
      "  'STORAGE_PROVIDER', 'JOB_PROVIDER', 'SSO_PROVIDER', 'NOTIFICATION_TRANSPORT',",
      "  'EMBEDDING_PROVIDER', 'VECTOR_STORE_PROVIDER', 'SUPPORT_PROVIDER',",
      "  'ENABLE_TWO_FACTOR', 'AUTH_MAGIC_LINK', 'AUTH_PASSKEYS',",
      "  'ENABLE_AI', 'ENABLE_AI_CHAT', 'ENABLE_AI_RAG', 'ENABLE_AI_AGENTS',",
      "  'ENABLE_AI_BATCH', 'ENABLE_AI_PLAYGROUND', 'ENABLE_BLOG', 'ENABLE_TEAMS',",
      "  'ENABLE_PROMOTIONS', 'ENABLE_SEO', 'ENABLE_COMPARE', 'ENABLE_DOCS', 'ENABLE_PLUGINS',",
      "  'ENABLE_ANALYTICS', 'ENABLE_WORKFLOWS',",
      '];',
      'export function createEnvSchema(environment = {}, { defaults = {} } = {}) {',
      "  const landing = environment.APP_MODE === 'landing';",
      "  const alwaysOn = new Set(['ENABLE_DOCS', 'ENABLE_BLOG', 'ENABLE_PROMOTIONS', 'ENABLE_PLUGINS']);",
      "  const landingOnly = new Set(['ENABLE_SEO', 'ENABLE_COMPARE']);",
      '  const defaultsByKey = {',
      "    APP_MODE: 'full', DB_PROVIDER: 'turso', AUTH_PROVIDER: landing ? 'none' : 'better-auth',",
      "    PAYMENT_PROVIDER: 'stripe', STORAGE_PROVIDER: 'local', JOB_PROVIDER: landing ? 'none' : 'memory',",
      "    SSO_PROVIDER: 'none', NOTIFICATION_TRANSPORT: 'poll', EMBEDDING_PROVIDER: 'openai',",
      "    VECTOR_STORE_PROVIDER: 'sqlite', SUPPORT_PROVIDER: 'none',",
      "    ENABLE_TWO_FACTOR: 'true', AUTH_MAGIC_LINK: 'true', AUTH_PASSKEYS: 'true',",
      "    ENABLE_AI: String(!landing), ENABLE_AI_CHAT: String(!landing), ENABLE_AI_RAG: 'false',",
      '    ENABLE_AI_AGENTS: String(!landing), ENABLE_AI_BATCH: String(!landing), ENABLE_AI_PLAYGROUND: String(!landing),',
      "    ENABLE_BLOG: 'true', ENABLE_TEAMS: String(!landing), ENABLE_PROMOTIONS: 'true',",
      "    ENABLE_SEO: String(landing), ENABLE_COMPARE: String(landing), ENABLE_DOCS: 'true',",
      "    ENABLE_PLUGINS: 'true', ENABLE_ANALYTICS: String(!landing), ENABLE_WORKFLOWS: String(!landing),",
      '    NEXT_PUBLIC_APP_NAME: defaults.appName, NEXT_PUBLIC_APP_URL: defaults.appUrl,',
      '  };',
      '  return { shape: Object.fromEntries(keys.map((key) => [key, { parse: (value) => value ?? (',
      "    alwaysOn.has(key) ? 'true' : landingOnly.has(key) ? String(landing) : defaultsByKey[key]",
      '  ) }])) };',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src/lib/auth/oauth-providers.ts'),
    "export const oauthCredentialKeys = { google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] };\n",
  );
}
