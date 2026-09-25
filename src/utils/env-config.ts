/**
 * Shared, read-only mirror of `src/config/env.ts` from the host project.
 *
 * Keep this file in sync with the host's `env.features`, `env.auth`,
 * provider enums, and the `superRefine` validation in
 * `codapult/src/config/env.ts` and `codapult/src/config/env-schema.ts`.
 * The CLI cannot import from the host project, so this module centralises
 * the provider/feature shape that several commands share regardless of whether
 * env values come from `.env.local` or `process.env`.
 */

export type DbProvider = 'turso' | 'postgres';
export type AuthProvider = 'better-auth' | 'kinde' | 'none';
export type PaymentProvider = 'stripe' | 'lemonsqueezy' | 'polar';
export type SSOProvider = 'jackson' | 'none';
export type StorageProvider = 'local' | 's3' | 'r2';
export type JobProvider = 'memory' | 'bullmq' | 'none';
export type NotificationTransport = 'poll' | 'sse' | 'ws';
export type EmbeddingProvider = 'openai' | 'ollama';
export type VectorStoreProvider = 'sqlite' | 'memory';
export type SupportProvider = 'crisp' | 'intercom' | 'none';

/** Feature toggle key → ENABLE_* env var. Order = display order. */
export const FEATURE_ENV = {
  apiDocs: 'ENABLE_API_DOCS',
  helpCenter: 'ENABLE_HELP_CENTER',
  blog: 'ENABLE_BLOG',
  waitlist: 'ENABLE_WAITLIST',
  featureRequests: 'ENABLE_FEATURE_REQUESTS',
  changelog: 'ENABLE_CHANGELOG',
  aiCore: 'ENABLE_AI_CORE',
  aiChat: 'ENABLE_AI_CHAT',
  aiRag: 'ENABLE_AI_RAG',
  aiAgents: 'ENABLE_AI_AGENTS',
  aiBatch: 'ENABLE_AI_BATCH',
  aiPlayground: 'ENABLE_AI_PLAYGROUND',
  teams: 'ENABLE_TEAMS',
  referrals: 'ENABLE_REFERRALS',
  promotions: 'ENABLE_PROMOTIONS',
  analytics: 'ENABLE_ANALYTICS',
  workflows: 'ENABLE_WORKFLOWS',
  webhooks: 'ENABLE_WEBHOOKS',
  auditLog: 'ENABLE_AUDIT_LOG',
  reports: 'ENABLE_REPORTS',
  onboarding: 'ENABLE_ONBOARDING',
  branding: 'ENABLE_BRANDING',
  experiments: 'ENABLE_EXPERIMENTS',
  dripCampaigns: 'ENABLE_DRIP_CAMPAIGNS',
  plugins: 'ENABLE_PLUGINS',
  compare: 'ENABLE_COMPARE',
} as const;

/**
 * Snapshot of the host env-schema contract. The compatibility check compares
 * this explicit contract with `src/config/env-schema.ts`; adding a variable to
 * the template therefore produces an actionable doctor warning until the CLI
 * mirror is reviewed.
 */
export const ENV_SCHEMA_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_APP_NAME',
  'APP_MODE',
  'DEMO_URL',
  'LOG_LEVEL',
  'DB_PROVIDER',
  'AUTH_PROVIDER',
  'PAYMENT_PROVIDER',
  'STORAGE_PROVIDER',
  'JOB_PROVIDER',
  'SSO_PROVIDER',
  'NOTIFICATION_TRANSPORT',
  'EMBEDDING_PROVIDER',
  'VECTOR_STORE_PROVIDER',
  'SUPPORT_PROVIDER',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'DATABASE_URL',
  'ENABLE_TWO_FACTOR',
  'AUTH_MAGIC_LINK',
  'AUTH_PASSKEYS',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'KINDE_CLIENT_ID',
  'KINDE_CLIENT_SECRET',
  'KINDE_ISSUER_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_FEE_PERCENT',
  'STRIPE_CONNECT_ONBOARDING_RETURN_URL',
  'STRIPE_CONNECT_ONBOARDING_REFRESH_URL',
  'LEMONSQUEEZY_API_KEY',
  'LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  'POLAR_ACCESS_TOKEN',
  'POLAR_WEBHOOK_SECRET',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_URL',
  'JOB_QUEUE_NAME',
  'REDIS_URL',
  'CODAPULT_WORKER_MODE',
  'CODAPULT_DISABLE_IN_PROCESS_JOBS',
  'CUSTOM_DOMAIN_CNAME_TARGET',
  'REFERRAL_REWARD_AMOUNT',
  'REFERRAL_REWARD_TYPE',
  'SSO_PRODUCT',
  'SSO_DB_ENGINE',
  'SSO_DB_TYPE',
  'SSO_DB_URL',
  'NOTIFICATION_WS_URL',
  'NOTIFICATION_WS_PORT',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GROQ_API_KEY',
  'TOGETHER_AI_API_KEY',
  'CUSTOM_AI_BASE_URL',
  'CUSTOM_AI_API_KEY',
  'SERPER_API_KEY',
  'TAVILY_API_KEY',
  'AI_DEFAULT_MODEL',
  'AI_ALLOWED_MODELS',
  'AI_FALLBACK_CHAIN',
  'AI_MAX_RETRIES',
  'AI_DEFAULT_TEMPERATURE',
  'AI_DEFAULT_MAX_TOKENS',
  'AI_DEFAULT_TOP_P',
  'AI_DAILY_BUDGET_USD',
  'AI_MONTHLY_BUDGET_USD',
  'AI_HTTP_ALLOWLIST',
  'AI_RAG_MAX_DOCUMENT_SIZE',
  'AI_RAG_MAX_BATCH_DOCUMENTS',
  'AI_RAG_MAX_CHUNKS_PER_QUERY',
  'AI_RAG_MIN_SCORE',
  'OLLAMA_BASE_URL',
  'OLLAMA_EMBEDDING_MODEL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CRISP_WEBSITE_ID',
  'INTERCOM_APP_ID',
  'DEFAULT_MONTHLY_CREDITS',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_SERVICE_NAME',
  'OTEL_TRACES_SAMPLE_RATE',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'POSTHOG_TOKEN',
  'POSTHOG_HOST',
  'POSTHOG_UI_HOST',
  ...Object.values(FEATURE_ENV),
] as const;

/** Auth-gated features: when AUTH_PROVIDER=none, these are forced off. */
export const AUTH_GATED_FEATURES: ReadonlySet<string> = new Set([
  'apiDocs',
  'featureRequests',
  'changelog',
  'aiChat',
  'aiCore',
  'aiRag',
  'aiAgents',
  'aiBatch',
  'aiPlayground',
  'teams',
  'referrals',
]);

/** OAuth provider → [client id env, client secret env]. Mirrors oauth-providers.ts. */
export const OAUTH_CREDENTIAL_KEYS: Readonly<Record<string, [string, string]>> = {
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  github: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  apple: ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  twitter: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
};

/** Read a single var from raw .env content. Returns undefined if missing or empty. */
export function readEnvVar(envContent: string, key: string): string | undefined {
  const match = new RegExp(`^${key}\\s*=\\s*"?([^"\\n\\r]*)"?\\s*$`, 'm').exec(envContent);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** Same as `readEnvVar` but with a typed fallback. */
export function readEnv<T extends string>(envContent: string, key: string, fallback: T): T {
  return (readEnvVar(envContent, key) as T | undefined) ?? fallback;
}

export interface Adapters {
  database: DbProvider;
  auth: AuthProvider;
  sso: SSOProvider;
  payments: PaymentProvider;
  storage: StorageProvider;
  jobs: JobProvider;
  notifications: NotificationTransport;
  embedding: EmbeddingProvider;
  vectorStore: VectorStoreProvider;
  support: SupportProvider;
}

/** Resolve all adapters from .env content, applying the same defaults as `env.*`. */
export function getAdapters(envContent: string): Adapters {
  const landingMode = readEnv<string>(envContent, 'APP_MODE', 'app') === 'landing';
  const authProvider = readEnv<AuthProvider>(envContent, 'AUTH_PROVIDER', 'better-auth');
  return {
    database: readEnv<DbProvider>(envContent, 'DB_PROVIDER', 'turso'),
    auth: landingMode ? 'none' : authProvider,
    sso: readEnv<SSOProvider>(envContent, 'SSO_PROVIDER', 'none'),
    payments: readEnv<PaymentProvider>(envContent, 'PAYMENT_PROVIDER', 'stripe'),
    storage: readEnv<StorageProvider>(envContent, 'STORAGE_PROVIDER', 'local'),
    jobs: readEnv<JobProvider>(envContent, 'JOB_PROVIDER', 'memory'),
    notifications: readEnv<NotificationTransport>(envContent, 'NOTIFICATION_TRANSPORT', 'poll'),
    embedding: readEnv<EmbeddingProvider>(envContent, 'EMBEDDING_PROVIDER', 'openai'),
    vectorStore: readEnv<VectorStoreProvider>(envContent, 'VECTOR_STORE_PROVIDER', 'sqlite'),
    support: readEnv<SupportProvider>(envContent, 'SUPPORT_PROVIDER', 'none'),
  };
}

/**
 * Compute the effective set of feature toggles from .env content.
 * Mirrors `env.features` in `codapult/src/config/env.ts`:
 * - default `true` for every ENABLE_* (unset → enabled);
 * - explicit "false" disables;
 * - `auth` derived from AUTH_PROVIDER !== 'none';
 * - auth-gated features forced off when AUTH_PROVIDER=none.
 */
export function getFeatures(envContent: string): Record<string, boolean> {
  const appMode = readEnv<string>(envContent, 'APP_MODE', 'app');
  const authProvider = getAdapters(envContent).auth;
  const authEnabled = authProvider !== 'none';

  const features: Record<string, boolean> = { auth: authEnabled };

  for (const [key, envVar] of Object.entries(FEATURE_ENV)) {
    const raw = readEnvVar(envContent, envVar);
    const defaultEnabled =
      key === 'compare' ? appMode === 'landing' : key === 'aiRag' ? false : true;
    const enabled = raw == null ? defaultEnabled : raw !== 'false';
    features[key] = enabled && (!AUTH_GATED_FEATURES.has(key) || authEnabled);
  }

  if (!features.aiCore) {
    features.aiChat = false;
    features.aiRag = false;
    features.aiAgents = false;
    features.aiBatch = false;
    features.aiPlayground = false;
  }

  return features;
}

/** Auth-method toggles that live in env (not in app.ts). */
export interface AuthMethods {
  twoFactor: boolean;
  magicLink: boolean;
  passkeys: boolean;
}

export function getAuthMethods(envContent: string): AuthMethods {
  const authEnabled = getAdapters(envContent).auth !== 'none';
  return {
    twoFactor: authEnabled && readEnvVar(envContent, 'ENABLE_TWO_FACTOR') !== 'false',
    magicLink: (readEnvVar(envContent, 'AUTH_MAGIC_LINK') ?? 'true') === 'true',
    passkeys: (readEnvVar(envContent, 'AUTH_PASSKEYS') ?? 'true') === 'true',
  };
}

/** OAuth providers that have both client id + secret configured in .env. */
export function getOauthProviders(envContent: string): string[] {
  return Object.entries(OAUTH_CREDENTIAL_KEYS)
    .filter(([, [id, secret]]) => !!readEnvVar(envContent, id) && !!readEnvVar(envContent, secret))
    .map(([provider]) => provider);
}

/** Provider-conditional env var requirements (mirrors `superRefine`). */
export interface EnvIssue {
  key: string;
  message: string;
  severity: 'error' | 'warn';
}

export function findProviderIssues(envContent: string): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const adapters = getAdapters(envContent);
  const has = (k: (typeof ENV_SCHEMA_KEYS)[number]): boolean => readEnvVar(envContent, k) != null;

  if (adapters.database === 'turso' && !has('TURSO_DATABASE_URL')) {
    issues.push({
      key: 'TURSO_DATABASE_URL',
      message: 'Required when DB_PROVIDER="turso"',
      severity: 'error',
    });
  }
  if (adapters.database === 'postgres' && !has('DATABASE_URL')) {
    issues.push({
      key: 'DATABASE_URL',
      message: 'Required when DB_PROVIDER="postgres"',
      severity: 'error',
    });
  }

  if (adapters.auth === 'better-auth') {
    const secret = readEnvVar(envContent, 'BETTER_AUTH_SECRET');
    if (!secret) {
      issues.push({
        key: 'BETTER_AUTH_SECRET',
        message: 'Required when AUTH_PROVIDER="better-auth" (openssl rand -base64 32)',
        severity: 'error',
      });
    } else if (secret.length < 32) {
      issues.push({
        key: 'BETTER_AUTH_SECRET',
        message: 'Must be at least 32 characters',
        severity: 'error',
      });
    }
  }
  if (adapters.auth === 'kinde') {
    for (const k of ['KINDE_CLIENT_ID', 'KINDE_CLIENT_SECRET', 'KINDE_ISSUER_URL'] as const) {
      if (!has(k)) {
        issues.push({ key: k, message: 'Required when AUTH_PROVIDER="kinde"', severity: 'error' });
      }
    }
  }

  if (adapters.payments === 'stripe' && !has('STRIPE_SECRET_KEY')) {
    issues.push({
      key: 'STRIPE_SECRET_KEY',
      message: 'Required when PAYMENT_PROVIDER="stripe"',
      severity: 'error',
    });
  }
  if (adapters.payments === 'lemonsqueezy') {
    const label = `Required when PAYMENT_PROVIDER="${adapters.payments}"`;
    for (const k of ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_STORE_ID'] as const) {
      if (!has(k)) issues.push({ key: k, message: label, severity: 'error' });
    }
  }
  if (adapters.payments === 'polar' && !has('POLAR_ACCESS_TOKEN')) {
    issues.push({
      key: 'POLAR_ACCESS_TOKEN',
      message: 'Required when PAYMENT_PROVIDER="polar"',
      severity: 'error',
    });
  }

  if (adapters.storage === 's3' || adapters.storage === 'r2') {
    const label = `Required when STORAGE_PROVIDER="${adapters.storage}"`;
    for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
      if (!has(k)) issues.push({ key: k, message: label, severity: 'error' });
    }
  }

  if (adapters.jobs === 'bullmq' && !has('REDIS_URL')) {
    issues.push({
      key: 'REDIS_URL',
      message: 'Required when JOB_PROVIDER="bullmq"',
      severity: 'error',
    });
  }

  if (adapters.notifications === 'ws' && !has('NOTIFICATION_WS_URL')) {
    issues.push({
      key: 'NOTIFICATION_WS_URL',
      message: 'Required when NOTIFICATION_TRANSPORT="ws"',
      severity: 'error',
    });
  }

  if (adapters.support === 'crisp' && !has('CRISP_WEBSITE_ID')) {
    issues.push({
      key: 'CRISP_WEBSITE_ID',
      message: 'Required when SUPPORT_PROVIDER="crisp"',
      severity: 'error',
    });
  }
  if (adapters.support === 'intercom' && !has('INTERCOM_APP_ID')) {
    issues.push({
      key: 'INTERCOM_APP_ID',
      message: 'Required when SUPPORT_PROVIDER="intercom"',
      severity: 'error',
    });
  }

  return issues;
}
