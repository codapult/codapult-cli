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
      "  'ENABLE_PROMOTIONS', 'ENABLE_SEO', 'ENABLE_COMPARE', 'ENABLE_DOCS',",
      '];',
      'export function createEnvSchema(environment = {}, { defaults = {} } = {}) {',
      '  return { shape: Object.fromEntries(keys.map((key) => [key, { parse: (value) => value ?? ({',
      "    APP_MODE: 'full', DB_PROVIDER: 'turso', AUTH_PROVIDER: 'better-auth',",
      "    PAYMENT_PROVIDER: 'stripe', STORAGE_PROVIDER: 'local', JOB_PROVIDER: 'memory',",
      "    SSO_PROVIDER: 'none', NOTIFICATION_TRANSPORT: 'poll', EMBEDDING_PROVIDER: 'openai',",
      "    VECTOR_STORE_PROVIDER: 'sqlite', SUPPORT_PROVIDER: 'none',",
      "    ENABLE_TWO_FACTOR: 'true', AUTH_MAGIC_LINK: 'true', AUTH_PASSKEYS: 'true',",
      "    ENABLE_AI: 'true', ENABLE_AI_CHAT: 'true', ENABLE_AI_RAG: 'false',",
      "    ENABLE_AI_AGENTS: 'true', ENABLE_AI_BATCH: 'true', ENABLE_AI_PLAYGROUND: 'true',",
      "    ENABLE_BLOG: 'true', ENABLE_TEAMS: 'true', ENABLE_PROMOTIONS: 'true',",
      "    ENABLE_SEO: 'false', ENABLE_COMPARE: 'false', ENABLE_DOCS: 'true',",
      '    NEXT_PUBLIC_APP_NAME: defaults.appName, NEXT_PUBLIC_APP_URL: defaults.appUrl,',
      '  })[key] })) };',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src/lib/auth/oauth-providers.ts'),
    "export const oauthCredentialKeys = { google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] };\n",
  );
}
