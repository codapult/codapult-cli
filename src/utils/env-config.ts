/** CLI projections of the environment schema and values owned by the project. */
import {
  getProjectEnvSchema,
  getProjectEnvSchemaKeys,
  loadProjectAppConfig,
  loadProjectEnvSchema,
  loadProjectOAuthProviders,
  parseProjectEnv,
} from './project-env-schema.js';

type ProjectEnvSchema = ReturnType<typeof getProjectEnvSchema>;
interface ProjectEnvField {
  parse(value: unknown): unknown;
}

function getSchemaFieldValue(
  schema: ProjectEnvSchema,
  source: NodeJS.ProcessEnv,
  key: string,
): string {
  const field = schema.shape[key] as unknown as ProjectEnvField | undefined;
  if (field === undefined) throw new Error(`Environment schema does not define ${key}`);
  try {
    return String(field.parse(source[key]));
  } catch {
    return source[key] ?? '';
  }
}

/** Stable CLI presentation order; env variable names still come from the app schema. */
const FEATURE_DISPLAY_ORDER = [
  'apiDocs',
  'docs',
  'blog',
  'waitlist',
  'featureRequests',
  'changelog',
  'ai',
  'aiChat',
  'aiRag',
  'aiAgents',
  'aiBatch',
  'aiPlayground',
  'teams',
  'referrals',
  'promotions',
  'analytics',
  'workflows',
  'webhooks',
  'auditLog',
  'reports',
  'onboarding',
  'branding',
  'experiments',
  'dripCampaigns',
  'plugins',
  'compare',
  'seo',
  'graphql',
  'connect',
  'eventStore',
  'otel',
] as const;

/** Feature identifiers exposed by the app's ENABLE_* environment variables. */
export type FeatureKey = (typeof FEATURE_DISPLAY_ORDER)[number] | 'twoFactor';

export function getFeatureEnv(
  root: string,
  options: { includeAuthMethods?: boolean } = {},
): Record<string, string> {
  const discovered = getProjectEnvSchemaKeys(root)
    .filter((key) => key.startsWith('ENABLE_'))
    .map((envKey): [string, string] => [
      envKey
        .slice('ENABLE_'.length)
        .toLowerCase()
        .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      envKey,
    ]);
  const features = options.includeAuthMethods
    ? discovered
    : discovered.filter(([feature]) => feature !== 'twoFactor');
  const order = new Map<string, number>(
    FEATURE_DISPLAY_ORDER.map((feature, index) => [feature, index]),
  );
  return Object.fromEntries(
    features.sort(
      ([a], [b]) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

/** Read a single var from raw .env content. Returns undefined if missing or empty. */
export function readEnvVar(envContent: string, key: string): string | undefined {
  const value = parseProjectEnv(envContent)[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** Read a value after applying the project schema's transforms and defaults. */
export function getProjectEnvValue(envContent: string, root: string, key: string): string {
  const source = parseProjectEnv(envContent);
  return getSchemaFieldValue(getProjectEnvSchema(root, source), source, key);
}

export interface Adapters {
  database: string;
  auth: string;
  sso: string;
  payments: string;
  storage: string;
  jobs: string;
  notifications: string;
  embedding: string;
  vectorStore: string;
  support: string;
}

/** Resolve provider values and defaults through the project's own schema. */
function getAdaptersFromSchema(schema: ProjectEnvSchema, source: NodeJS.ProcessEnv): Adapters {
  const value = (key: string): string => getSchemaFieldValue(schema, source, key);
  return {
    database: value('DB_PROVIDER'),
    auth: value('AUTH_PROVIDER'),
    sso: value('SSO_PROVIDER'),
    payments: value('PAYMENT_PROVIDER'),
    storage: value('STORAGE_PROVIDER'),
    jobs: value('JOB_PROVIDER'),
    notifications: value('NOTIFICATION_TRANSPORT'),
    embedding: value('EMBEDDING_PROVIDER'),
    vectorStore: value('VECTOR_STORE_PROVIDER'),
    support: value('SUPPORT_PROVIDER'),
  };
}

export function getAdapters(envContent: string, root: string): Adapters {
  const source = parseProjectEnv(envContent);
  const schema = getProjectEnvSchema(root, source);
  return getAdaptersFromSchema(schema, source);
}

type Features = Record<string, boolean>;

/** Resolve feature toggles with schema defaults and CLI-specific dependencies. */
export function getFeatures(envContent: string, root: string): Features {
  const source = parseProjectEnv(envContent);
  const schema = getProjectEnvSchema(root, source);
  const featureEnv = getFeatureEnv(root);
  const features: Features = {};

  for (const [feature, envKey] of Object.entries(featureEnv)) {
    const value = getSchemaFieldValue(schema, source, envKey);
    features[feature] = value !== 'false';
  }

  const adapters = getAdaptersFromSchema(schema, source);
  features.auth = adapters.auth !== 'none';
  features.sso = adapters.sso !== 'none';
  features.jobs = adapters.jobs !== 'none';

  const parentFeature: Partial<Record<FeatureKey, FeatureKey>> = {
    aiChat: 'ai',
    aiRag: 'ai',
    aiAgents: 'ai',
    aiBatch: 'ai',
    aiPlayground: 'ai',
    branding: 'teams',
  };
  for (const [feature, parent] of Object.entries(parentFeature)) {
    if (!features[parent]) features[feature] = false;
  }
  return features;
}

/** Auth-method toggles that live in the environment schema. */
export interface AuthMethods {
  twoFactor: boolean;
  magicLink: boolean;
  passkeys: boolean;
}

export function getAuthMethods(envContent: string, root: string): AuthMethods {
  const source = parseProjectEnv(envContent);
  const schema = getProjectEnvSchema(root, source);
  const value = (key: string): boolean => getSchemaFieldValue(schema, source, key) === 'true';
  return {
    twoFactor: value('ENABLE_TWO_FACTOR'),
    magicLink: value('AUTH_MAGIC_LINK'),
    passkeys: value('AUTH_PASSKEYS'),
  };
}

/** OAuth providers are derived from matching credential keys in the schema. */
export function getOauthProviders(envContent: string, root: string): string[] {
  const source = parseProjectEnv(envContent);
  const { oauthCredentialKeys: credentials } = loadProjectOAuthProviders(root);
  return Object.entries(credentials)
    .filter(([, [idKey, secretKey]]) => !!source[idKey] && !!source[secretKey])
    .map(([provider]) => provider);
}

/** Schema validation issues exposed by env check and project health. */
export interface EnvIssue {
  key: string;
  message: string;
  severity: 'error' | 'warn';
}

export function findEnvIssues(envContent: string, projectRoot: string): EnvIssue[] {
  try {
    const source = parseProjectEnv(envContent);
    const defaults = loadProjectAppConfig(projectRoot).createAppConfig(source);
    const schema = loadProjectEnvSchema(projectRoot).createEnvSchema(source, {
      skipRuntimeChecks: false,
      defaults,
    });
    const result = schema.safeParse(source);
    if (result.success) return [];

    return result.error.issues.map((issue) => ({
      key: typeof issue.path[0] === 'string' ? issue.path[0] : 'ENV',
      message: issue.message,
      severity: 'error',
    }));
  } catch (error) {
    return [{ key: 'ENV_SCHEMA', message: String(error), severity: 'error' }];
  }
}
