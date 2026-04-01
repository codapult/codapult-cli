import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot, readProjectFile } from '../utils/project.js';

function loadProjectContext(): { schema: string; config: string } {
  const root = findProjectRoot();
  if (!root) return { schema: '', config: '' };
  return {
    schema: readProjectFile(root, 'src/lib/db/schema.ts') ?? '',
    config: readProjectFile(root, 'src/config/app.ts') ?? '',
  };
}

function extractTableNames(schema: string): string {
  const matches = [...schema.matchAll(/export\s+const\s+\w+\s*=\s*(?:sqliteTable|pgTable)\(\s*['"](\w+)['"]/g)];
  return matches.map(m => m[1]).join(', ');
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'launchkit_code_review',
    {
      title: 'LaunchKit Code Review',
      description: 'Review code against LaunchKit conventions: API pattern (auth→rate limit→Zod→response), adapter usage, TypeScript strict mode, server components first. Auto-includes current project config.',
      argsSchema: {
        code: z.string().describe('The code to review'),
        focus: z.string().optional().describe('Focus area: "security" | "performance" | "conventions" | "typescript"'),
      },
    },
    ({ code, focus }) => {
      const ctx = loadProjectContext();
      const focusInstruction = focus
        ? `Focus specifically on: ${focus}.`
        : 'Cover all aspects: security, performance, conventions, and TypeScript quality.';

      const tables = extractTableNames(ctx.schema);
      const projectContext = tables
        ? `\n\nProject context:\n- Database tables: ${tables}\n- Config preview:\n\`\`\`typescript\n${ctx.config.slice(0, 600)}\n\`\`\``
        : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Review the following code against LaunchKit conventions. ${focusInstruction}

LaunchKit conventions:
- API routes: auth check (getAppSession) → rate limiting (checkRateLimit) → Zod validation → business logic → NextResponse.json
- Server actions: 'use server' directive, auth check, rate limiting, Zod parse, revalidatePath
- TypeScript: strict mode, no \`any\`, prefer \`satisfies\` over \`as\`, \`unknown\` + type guards
- React: server components by default, \`'use client'\` only when needed
- Imports: use \`@/\` path alias, UI from \`@/components/ui/\`, utils from \`@/lib/utils\`
- Error responses: always \`{ error: string }\`, never expose stack traces
- Database: Drizzle ORM, snake_case tables/columns, text PKs, integer timestamps
- Class merging: use \`cn()\` from \`@/lib/utils\`
- AI: embedding/vector store use adapter pattern, RAG config from appConfig.ai
- Org quotas: enforce via checkOrgQuota() for AI and API routes${projectContext}

Code to review:

\`\`\`
${code}
\`\`\``,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'launchkit_schema_design',
    {
      title: 'LaunchKit Schema Design',
      description: 'Design a Drizzle ORM table following LaunchKit conventions. Auto-includes current schema for context (existing tables, naming patterns).',
      argsSchema: {
        description: z.string().describe('What the table should store (e.g. "user bookmarks with URL, title, and tags")'),
      },
    },
    ({ description }) => {
      const ctx = loadProjectContext();
      const tables = extractTableNames(ctx.schema);
      const existingContext = tables
        ? `\n\nExisting tables in this project: ${tables}\nEnsure your new table follows the same patterns and avoids name conflicts.`
        : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Design a Drizzle ORM SQLite table for the following requirement:

"${description}"

Follow LaunchKit schema conventions:
- Use \`sqliteTable()\` from \`drizzle-orm/sqlite-core\`
- Table name: singular snake_case (e.g. \`bookmark\`, \`user_preference\`)
- Primary key: \`text('id').primaryKey()\` (nanoid/UUID, not auto-increment)
- Timestamps: \`integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())\`
- Foreign keys: always specify \`onDelete\` behavior (\`cascade\`, \`set null\`)
- Booleans: \`integer('col', { mode: 'boolean' })\`
- Type-safe enums: use \`.$type<TypeName>()\` with exported union type
- Export the table const and any type aliases

Also provide the Postgres equivalent using \`pgTable()\` with native types (\`timestamp\`, \`boolean\`).

Output both the SQLite and Postgres table definitions.${existingContext}`,
            },
          },
        ],
      };
    },
  );
}
