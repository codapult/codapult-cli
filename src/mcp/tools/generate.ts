import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot } from '../../utils/project.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

function toKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
function toPascal(name: string): string {
  return toKebab(name)
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
function toCamel(name: string): string {
  const p = toPascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function writeIfNew(filePath: string, content: string): { created: boolean; path: string } {
  if (existsSync(filePath)) return { created: false, path: filePath };
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return { created: true, path: filePath };
}

export function registerGenerateTools(server: McpServer): void {
  server.registerTool(
    'codapult_generate_page',
    {
      title: 'Generate Page',
      description:
        'Create a new dashboard page following Codapult conventions (server component, auth, Card UI)',
      inputSchema: { name: z.string().describe('Page name (e.g. "analytics", "team-settings")') },
    },
    ({ name }) => {
      const root = getRoot();
      const kebab = toKebab(name);
      const pascal = toPascal(name);
      const title = pascal.replace(/([A-Z])/g, ' $1').trim();

      const page = `import { getAppSession } from '@/lib/auth';\nimport { redirect } from 'next/navigation';\nimport { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';\n\nexport const metadata = {\n  title: '${title} — Codapult',\n};\n\nexport default async function ${pascal}Page() {\n  const session = await getAppSession();\n  if (!session) redirect('/sign-in');\n\n  return (\n    <div className="space-y-6">\n      <div>\n        <h1 className="text-3xl font-bold tracking-tight">${title}</h1>\n        <p className="text-muted-foreground">Manage your ${kebab} settings</p>\n      </div>\n\n      <Card>\n        <CardHeader>\n          <CardTitle>${title}</CardTitle>\n          <CardDescription>Your ${kebab} content goes here</CardDescription>\n        </CardHeader>\n        <CardContent>\n          <p className="text-muted-foreground">Start building your ${kebab} page.</p>\n        </CardContent>\n      </Card>\n    </div>\n  );\n}\n`;

      const result = writeIfNew(
        resolve(root, `src/app/(dashboard)/dashboard/${kebab}/page.tsx`),
        page,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'codapult_generate_api',
    {
      title: 'Generate API Route',
      description: 'Create a new API route with auth, rate limiting, and Zod validation',
      inputSchema: { name: z.string().describe('Route name (e.g. "webhooks", "billing")') },
    },
    ({ name }) => {
      const root = getRoot();
      const kebab = toKebab(name);
      const camel = toCamel(name);
      const schemaName = `${camel}Schema`;

      const route = `import { NextResponse } from 'next/server';\nimport { getAppSession } from '@/lib/auth';\nimport { checkRateLimit } from '@/lib/rate-limit';\nimport { z } from 'zod';\n\nconst ${schemaName} = z.object({\n  // Define your request body schema here\n});\n\nexport async function GET() {\n  const session = await getAppSession();\n  if (!session) {\n    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n  }\n\n  const { allowed, resetAt } = checkRateLimit(\`${kebab}:\${session.user.id}\`, {\n    limit: 30,\n    windowSeconds: 60,\n  });\n  if (!allowed) {\n    return NextResponse.json(\n      { error: 'Too many requests. Please wait a moment.' },\n      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } },\n    );\n  }\n\n  return NextResponse.json({ message: 'ok' });\n}\n\nexport async function POST(req: Request) {\n  const session = await getAppSession();\n  if (!session) {\n    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n  }\n\n  const { allowed, resetAt } = checkRateLimit(\`${kebab}:\${session.user.id}\`, {\n    limit: 30,\n    windowSeconds: 60,\n  });\n  if (!allowed) {\n    return NextResponse.json(\n      { error: 'Too many requests. Please wait a moment.' },\n      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } },\n    );\n  }\n\n  try {\n    const body = ${schemaName}.parse(await req.json());\n    return NextResponse.json({ success: true });\n  } catch {\n    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });\n  }\n}\n`;

      const result = writeIfNew(resolve(root, `src/app/api/${kebab}/route.ts`), route);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'codapult_generate_action',
    {
      title: 'Generate Server Action',
      description: 'Create a new server action with auth, rate limiting, and Zod validation',
      inputSchema: {
        name: z.string().describe('Action name (e.g. "update-profile", "create-team")'),
      },
    },
    ({ name }) => {
      const root = getRoot();
      const kebab = toKebab(name);
      const camel = toCamel(name);
      const schemaName = `${camel}Schema`;

      const action = `'use server';\n\nimport { redirect } from 'next/navigation';\nimport { revalidatePath } from 'next/cache';\nimport { getAppSession } from '@/lib/auth';\nimport { checkRateLimit } from '@/lib/rate-limit';\nimport { z } from 'zod';\n\nconst ${schemaName} = z.object({\n  // Define your input schema here\n});\n\nconst RATE_LIMIT = { limit: 10, windowSeconds: 60 } as const;\n\nexport async function ${camel}Action(input: unknown): Promise<{ success: boolean }> {\n  const session = await getAppSession();\n  if (!session) redirect('/sign-in');\n\n  const { allowed } = checkRateLimit(\`${kebab}:\${session.user.id}\`, RATE_LIMIT);\n  if (!allowed) throw new Error('Too many requests. Please wait a moment.');\n\n  const data = ${schemaName}.parse(input);\n\n  // TODO: implement your action logic\n\n  revalidatePath('/dashboard/${kebab}');\n  return { success: true };\n}\n`;

      const result = writeIfNew(resolve(root, `src/lib/actions/${kebab}.ts`), action);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'codapult_generate_plugin',
    {
      title: 'Generate Plugin',
      description:
        'Scaffold a new plugin repository with package.json, tsconfig, index.ts, and manifest',
      inputSchema: { name: z.string().describe('Plugin name (e.g. "my-widget")') },
    },
    ({ name }) => {
      const root = getRoot();
      const kebab = toKebab(name);
      const camel = toCamel(name);
      const pascal = toPascal(name);
      const pluginDir = resolve(root, '..', `codapult-plugin-${kebab}`);

      if (existsSync(pluginDir)) {
        return {
          content: [{ type: 'text' as const, text: `Directory already exists: ${pluginDir}` }],
          isError: true,
        };
      }

      mkdirSync(resolve(pluginDir, 'src'), { recursive: true });

      writeFileSync(
        resolve(pluginDir, 'package.json'),
        JSON.stringify(
          {
            name: `@codapult/plugin-${kebab}`,
            version: '0.1.0',
            description: `Codapult plugin: ${name}`,
            license: 'MIT',
            type: 'module',
            main: './src/index.ts',
            exports: { '.': './src/index.ts' },
            peerDependencies: { react: '>=19', next: '>=16' },
            devDependencies: { typescript: '^5' },
            packageManager: 'pnpm@10.0.0',
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      );

      writeFileSync(
        resolve(pluginDir, 'src/index.ts'),
        `import type { CodapultPlugin } from '@/lib/plugins';\n\nconst ${camel}Plugin: CodapultPlugin = {\n  name: '${kebab}',\n  version: '0.1.0',\n  description: '${pascal} plugin for Codapult',\n  onInit() {},\n  navItems: [{ id: '${kebab}', label: '${pascal}', href: '/dashboard/${kebab}', icon: 'Puzzle', order: 50 }],\n  settingsPanels: [],\n  apiRoutes: [{ method: 'GET', path: '/status', async handler() { return Response.json({ status: 'ok', plugin: '${kebab}' }); } }],\n};\n\nexport default ${camel}Plugin;\n`,
        'utf-8',
      );

      writeFileSync(
        resolve(pluginDir, 'codapult-plugin.json'),
        JSON.stringify(
          {
            name: kebab,
            package: `@codapult/plugin-${kebab}`,
            version: '0.1.0',
            description: `${pascal} plugin for Codapult`,
            install: { transpilePackages: [`@codapult/plugin-${kebab}`], pages: {}, env: {} },
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      );

      writeFileSync(resolve(pluginDir, '.gitignore'), 'node_modules\ndist\n', 'utf-8');

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ created: true, path: pluginDir }) },
        ],
      };
    },
  );
}
