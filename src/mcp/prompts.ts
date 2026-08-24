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
  const matches = [
    ...schema.matchAll(/export\s+const\s+\w+\s*=\s*(?:sqliteTable|pgTable)\(\s*['"](\w+)['"]/g),
  ];
  return matches.map((m) => m[1]).join(', ');
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'codapult_code_review',
    {
      title: 'Codapult Code Review',
      description:
        'Review code against Codapult conventions: API pattern (auth→rate limit→Zod→response), adapter usage, TypeScript strict mode, server components first. Auto-includes current project config.',
      argsSchema: {
        code: z.string().describe('The code to review'),
        focus: z
          .string()
          .optional()
          .describe('Focus area: "security" | "performance" | "conventions" | "typescript"'),
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
              text: `Review the following code against Codapult conventions. ${focusInstruction}

Codapult conventions:
- API routes: auth check (getAppSession) → rate limiting (checkRateLimit) → Zod validation → business logic → NextResponse.json
- Server actions: 'use server' directive, auth check, rate limiting, Zod parse, revalidatePath
- TypeScript: strict mode, no \`any\`, prefer \`satisfies\` over \`as\`, \`unknown\` + type guards
- React: server components by default, \`'use client'\` only when needed
- Imports: use \`@/\` path alias, UI from \`@/components/ui/\`, utils from \`@/lib/utils\`
- Error responses: always \`{ error: string }\`, never expose stack traces
- Database: Drizzle ORM, snake_case tables/columns, text PKs, integer timestamps
- Class merging: use \`cn()\` from \`@/lib/utils\`
- AI: use the shared /api/ai gateway for chat, agents, tools, guardrails, metering, and streaming
- RAG: use the adapter pattern for embeddings/vector storage; it is opt-in via env.features.aiRag, requires env.features.aiCore, and all indexed data must be scoped to the active organization
- RAG indexing/search limits come from env (AI_RAG_MAX_DOCUMENT_SIZE, AI_RAG_MAX_BATCH_DOCUMENTS, AI_RAG_MAX_CHUNKS_PER_QUERY, AI_RAG_MIN_SCORE)
- AI defaults come from env (AI_DEFAULT_MODEL, AI_DEFAULT_TEMPERATURE, AI_DEFAULT_MAX_TOKENS, AI_DEFAULT_TOP_P, AI_MAX_RETRIES)
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
    'codapult_schema_design',
    {
      title: 'Codapult Schema Design',
      description:
        'Design a Drizzle ORM table following Codapult conventions. Auto-includes current schema for context (existing tables, naming patterns).',
      argsSchema: {
        description: z
          .string()
          .describe(
            'What the table should store (e.g. "user bookmarks with URL, title, and tags")',
          ),
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

Follow Codapult schema conventions:
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
