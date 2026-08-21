import { readProjectFile } from './project.js';

export interface AppConfigSummary {
  brand: Record<string, string>;
  company: Record<string, string>;
  ai: {
    defaultModel?: string;
    ragEnabled?: boolean;
    ragMaxChunks?: string;
    ragMinScore?: string;
  };
}

function stringField(content: string, field: string): string | undefined {
  const quotes = '[\'"` ]'.replace(' ', '');
  return new RegExp('\\b' + field + '\\s*:\\s*' + quotes + '([^\'"`]+)' + quotes).exec(
    content,
  )?.[1];
}

function numberField(content: string, field: string): string | undefined {
  return new RegExp(`\\b${field}\\s*:\\s*([\\d.]+)`).exec(content)?.[1];
}

function booleanField(content: string, field: string): boolean | undefined {
  const value = new RegExp(`\\b${field}\\s*:\\s*(true|false)`).exec(content)?.[1];
  return value === undefined ? undefined : value === 'true';
}

function strings(content: string, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = stringField(content, field);
      return value === undefined ? [] : [[field, value] as const];
    }),
  );
}

/** Read the stable, displayable subset of app.ts for both CLI and MCP clients. */
export function collectAppConfigSummary(root: string): AppConfigSummary | undefined {
  const content = readProjectFile(root, 'src/config/app.ts');
  if (!content) return undefined;
  const ai: AppConfigSummary['ai'] = { defaultModel: stringField(content, 'defaultModel') };
  const ragEnabled = booleanField(content, 'ragEnabled');
  const ragMaxChunks = numberField(content, 'ragMaxChunks');
  const ragMinScore = numberField(content, 'ragMinScore');
  if (ai.defaultModel === undefined) delete ai.defaultModel;
  if (ragEnabled !== undefined) ai.ragEnabled = ragEnabled;
  if (ragMaxChunks !== undefined) ai.ragMaxChunks = ragMaxChunks;
  if (ragMinScore !== undefined) ai.ragMinScore = ragMinScore;
  return {
    brand: strings(content, ['name', 'description', 'logo', 'favicon']),
    company: strings(content, ['contactEmail', 'githubUrl']),
    ai,
  };
}
