import { readProjectFile } from './project.js';

export interface AppConfigSummary {
  brand: Record<string, string>;
  company: Record<string, string>;
}

function stringField(content: string, field: string): string | undefined {
  const quotes = '[\'"` ]'.replace(' ', '');
  return new RegExp('\\b' + field + '\\s*:\\s*' + quotes + '([^\'"`]+)' + quotes).exec(
    content,
  )?.[1];
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
  return {
    brand: strings(content, ['name', 'description', 'logo', 'favicon']),
    company: strings(content, ['contactEmail', 'githubUrl']),
  };
}
