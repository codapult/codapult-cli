import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'launchkit_code_review',
    {
      title: 'LaunchKit Code Review',
      description: 'Review code against LaunchKit conventions: API pattern (auth→rate limit→Zod→response), adapter usage, TypeScript strict mode, server components first',
      argsSchema: {
        code: z.string().describe('The code to review'),
        focus: z.string().optional().describe('Focus area: "security" | "performance" | "conventions" | "typescript"'),
      },
    },
    ({ code, focus }) => {
      const focusInstruction = focus
        ? `Focus specifically on: ${focus}.`
        : 'Cover all aspects: security, performance, conventions, and TypeScript quality.';

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
      description: 'Design a Drizzle ORM table following LaunchKit conventions (snake_case, text PK, integer timestamps, FK with onDelete)',
      argsSchema: {
        description: z.string().describe('What the table should store (e.g. "user bookmarks with URL, title, and tags")'),
      },
    },
    ({ description }) => ({
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

Output both the SQLite and Postgres table definitions.`,
          },
        },
      ],
    }),
  );
}
