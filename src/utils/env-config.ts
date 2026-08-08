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
export type StorageProvider = 'local' | 's3' | 'r2';
export type JobProvider = 'memory' | 'bullmq';
export type NotificationTransport = 'poll' | 'sse' | 'ws';
export type EmbeddingProvider = 'openai' | 'ollama';
export type VectorStoreProvider = 'sqlite' | 'memory';

/** Feature toggle key → ENABLE_* env var. Order = display order. */
export const FEATURE_ENV: Readonly<Record<string, string>> = {
  apiDocs: 'ENABLE_API_DOCS',
  helpCenter: 'ENABLE_HELP_CENTER',
  blog: 'ENABLE_BLOG',
  waitlist: 'ENABLE_WAITLIST',
  featureRequests: 'ENABLE_FEATURE_REQUESTS',
  changelog: 'ENABLE_CHANGELOG',
  aiChat: 'ENABLE_AI_CHAT',
  teams: 'ENABLE_TEAMS',
  referrals: 'ENABLE_REFERRALS',
  analytics: 'ENABLE_ANALYTICS',
  workflows: 'ENABLE_WORKFLOWS',
  webhooks: 'ENABLE_WEBHOOKS',
  auditLog: 'ENABLE_AUDIT_LOG',
  reports: 'ENABLE_REPORTS',
  onboarding: 'ENABLE_ONBOARDING',
  branding: 'ENABLE_BRANDING',
  sso: 'ENABLE_SSO',
  experiments: 'ENABLE_EXPERIMENTS',
  dripCampaigns: 'ENABLE_DRIP_CAMPAIGNS',
  plugins: 'ENABLE_PLUGINS',
};

/** Auth-gated features: when AUTH_PROVIDER=none, these are forced off. */
export const AUTH_GATED_FEATURES: ReadonlySet<string> = new Set([
  'apiDocs',
  'featureRequests',
  'changelog',
  'aiChat',
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
  payments: PaymentProvider;
  storage: StorageProvider;
  jobs: JobProvider;
  notifications: NotificationTransport;
  embedding: EmbeddingProvider;
  vectorStore: VectorStoreProvider;
}

/** Resolve all adapters from .env content, applying the same defaults as `env.*`. */
export function getAdapters(envContent: string): Adapters {
  return {
    database: readEnv<DbProvider>(envContent, 'DB_PROVIDER', 'turso'),
    auth: readEnv<AuthProvider>(envContent, 'AUTH_PROVIDER', 'better-auth'),
    payments: readEnv<PaymentProvider>(envContent, 'PAYMENT_PROVIDER', 'stripe'),
    storage: readEnv<StorageProvider>(envContent, 'STORAGE_PROVIDER', 'local'),
    jobs: readEnv<JobProvider>(envContent, 'JOB_PROVIDER', 'memory'),
    notifications: readEnv<NotificationTransport>(envContent, 'NOTIFICATION_TRANSPORT', 'poll'),
    embedding: readEnv<EmbeddingProvider>(envContent, 'EMBEDDING_PROVIDER', 'openai'),
    vectorStore: readEnv<VectorStoreProvider>(envContent, 'VECTOR_STORE_PROVIDER', 'sqlite'),
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
  const authProvider = readEnv<AuthProvider>(envContent, 'AUTH_PROVIDER', 'better-auth');
  const authEnabled = authProvider !== 'none';

  const features: Record<string, boolean> = { auth: authEnabled };

  for (const [key, envVar] of Object.entries(FEATURE_ENV)) {
    const raw = readEnvVar(envContent, envVar);
    const enabled = raw !== 'false';
    features[key] = enabled && (!AUTH_GATED_FEATURES.has(key) || authEnabled);
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
  const authEnabled = readEnv<AuthProvider>(envContent, 'AUTH_PROVIDER', 'better-auth') !== 'none';
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
  const has = (k: string): boolean => readEnvVar(envContent, k) != null;

  if (adapters.database === 'turso') {
    if (!has('TURSO_DATABASE_URL')) {
      issues.push({
        key: 'TURSO_DATABASE_URL',
        message: 'Required when DB_PROVIDER="turso"',
        severity: 'error',
      });
    }
    if (!has('TURSO_AUTH_TOKEN')) {
      issues.push({
        key: 'TURSO_AUTH_TOKEN',
        message: 'Required when DB_PROVIDER="turso"',
        severity: 'warn',
      });
    }
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
    for (const k of ['KINDE_CLIENT_ID', 'KINDE_CLIENT_SECRET', 'KINDE_ISSUER_URL']) {
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
    if (!has('LEMONSQUEEZY_API_KEY')) {
      issues.push({
        key: 'LEMONSQUEEZY_API_KEY',
        message: 'Required when PAYMENT_PROVIDER="lemonsqueezy"',
        severity: 'error',
      });
    }
    if (!has('LEMONSQUEEZY_STORE_ID')) {
      issues.push({
        key: 'LEMONSQUEEZY_STORE_ID',
        message: 'Required when PAYMENT_PROVIDER="lemonsqueezy"',
        severity: 'error',
      });
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
    for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
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

  return issues;
}
