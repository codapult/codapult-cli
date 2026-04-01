import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { findProjectRoot } from '../utils/project.js';
import { heading, success, fail, info, dim, confirm } from '../utils/ui.js';

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
  const pascal = toPascal(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function writeIfNotExists(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

// ---------------------------------------------------------------------------
// codapult generate page <name>
// ---------------------------------------------------------------------------

export async function generatePageCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  const kebab = toKebab(name);
  const pascal = toPascal(name);
  const title = pascal.replace(/([A-Z])/g, ' $1').trim();

  heading(`Generating dashboard page: ${kebab}`);

  const pagePath = resolve(root, `src/app/(dashboard)/dashboard/${kebab}/page.tsx`);
  const page = `import { getAppSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: '${title} — Codapult',
};

export default async function ${pascal}Page() {
  const session = await getAppSession();
  if (!session) redirect('/sign-in');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">${title}</h1>
        <p className="text-muted-foreground">Manage your ${kebab} settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>${title}</CardTitle>
          <CardDescription>Your ${kebab} content goes here</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Start building your ${kebab} page.</p>
        </CardContent>
      </Card>
    </div>
  );
}
`;

  if (writeIfNotExists(pagePath, page)) {
    success(`Created ${pagePath.replace(root, '')}`);
  } else {
    fail(`File already exists: ${pagePath.replace(root, '')}`);
  }

  dim('Add a nav item in src/config/navigation.ts to link this page.');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult generate api <name>
// ---------------------------------------------------------------------------

export async function generateApiCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  const kebab = toKebab(name);
  const camel = toCamel(name);
  const schemaName = `${camel}Schema`;

  heading(`Generating API route: /api/${kebab}`);

  const routePath = resolve(root, `src/app/api/${kebab}/route.ts`);
  const route = `import { NextResponse } from 'next/server';
import { getAppSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ${schemaName} = z.object({
  // Define your request body schema here
});

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { allowed, resetAt } = checkRateLimit(\`${kebab}:\${session.user.id}\`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } },
    );
  }

  // TODO: implement your GET logic
  return NextResponse.json({ message: 'ok' });
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { allowed, resetAt } = checkRateLimit(\`${kebab}:\${session.user.id}\`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = ${schemaName}.parse(await req.json());
    // TODO: implement your POST logic
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
`;

  if (writeIfNotExists(routePath, route)) {
    success(`Created ${routePath.replace(root, '')}`);
  } else {
    fail(`File already exists: ${routePath.replace(root, '')}`);
  }

  dim('Move Zod schema to src/lib/validation.ts for shared access.');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult generate action <name>
// ---------------------------------------------------------------------------

export async function generateActionCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  const kebab = toKebab(name);
  const camel = toCamel(name);
  const pascal = toPascal(name);
  const schemaName = `${camel}Schema`;

  heading(`Generating server action: ${kebab}`);

  const actionPath = resolve(root, `src/lib/actions/${kebab}.ts`);
  const action = `'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAppSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ${schemaName} = z.object({
  // Define your input schema here
});

const RATE_LIMIT = { limit: 10, windowSeconds: 60 } as const;

export async function ${camel}Action(input: unknown): Promise<{ success: boolean }> {
  const session = await getAppSession();
  if (!session) redirect('/sign-in');

  const { allowed } = checkRateLimit(\`${kebab}:\${session.user.id}\`, RATE_LIMIT);
  if (!allowed) throw new Error('Too many requests. Please wait a moment.');

  const data = ${schemaName}.parse(input);

  // TODO: implement your action logic

  revalidatePath('/dashboard/${kebab}');
  return { success: true };
}
`;

  if (writeIfNotExists(actionPath, action)) {
    success(`Created ${actionPath.replace(root, '')}`);
  } else {
    fail(`File already exists: ${actionPath.replace(root, '')}`);
  }

  dim('Move Zod schema to src/lib/validation.ts for shared access.');
  console.log();
}

// ---------------------------------------------------------------------------
// codapult generate plugin <name>
// ---------------------------------------------------------------------------

export async function generatePluginCommand(name: string): Promise<void> {
  const root = findProjectRoot();
  if (!root) { fail('Not inside a Codapult project.'); process.exit(1); }

  const kebab = toKebab(name);
  const camel = toCamel(name);
  const pascal = toPascal(name);
  const pluginDir = resolve(root, '..', `codapult-plugin-${kebab}`);

  heading(`Generating plugin scaffold: ${kebab}`);

  if (existsSync(pluginDir)) {
    fail(`Directory already exists: ${pluginDir}`);
    process.exit(1);
  }

  // package.json
  const pkg = JSON.stringify({
    name: `@codapult/plugin-${kebab}`,
    version: '0.1.0',
    description: `Codapult plugin: ${name}`,
    license: 'MIT',
    type: 'module',
    main: './src/index.ts',
    exports: { '.': './src/index.ts' },
    peerDependencies: { react: '>=19', 'next': '>=16' },
    devDependencies: { typescript: '^5' },
    packageManager: 'pnpm@10.0.0',
  }, null, 2) + '\n';
  writeIfNotExists(resolve(pluginDir, 'package.json'), pkg);
  success('package.json');

  // tsconfig.json
  const tsconfig = JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
      outDir: './dist',
      paths: { '@/*': ['../../codapult/src/*'] },
    },
    include: ['src'],
  }, null, 2) + '\n';
  writeIfNotExists(resolve(pluginDir, 'tsconfig.json'), tsconfig);
  success('tsconfig.json');

  // src/index.ts
  const indexTs = `import type { CodapultPlugin } from '@/lib/plugins';

const ${camel}Plugin: CodapultPlugin = {
  name: '${kebab}',
  version: '0.1.0',
  description: '${pascal} plugin for Codapult',

  onInit() {
    // Plugin initialization logic
  },

  navItems: [
    {
      id: '${kebab}',
      label: '${pascal}',
      href: '/dashboard/${kebab}',
      icon: 'Puzzle',
      order: 50,
    },
  ],

  settingsPanels: [],

  apiRoutes: [
    {
      method: 'GET',
      path: '/status',
      async handler() {
        return Response.json({ status: 'ok', plugin: '${kebab}' });
      },
    },
  ],
};

export default ${camel}Plugin;
`;
  writeIfNotExists(resolve(pluginDir, 'src/index.ts'), indexTs);
  success('src/index.ts');

  // codapult-plugin.json manifest
  const manifest = JSON.stringify({
    name: kebab,
    package: `@codapult/plugin-${kebab}`,
    version: '0.1.0',
    description: `${pascal} plugin for Codapult`,
    install: {
      transpilePackages: [`@codapult/plugin-${kebab}`],
      pages: {
        [`src/app/(dashboard)/dashboard/${kebab}/page.tsx`]:
          `@codapult/plugin-${kebab}/pages/${kebab}-page`,
      },
      env: {},
    },
  }, null, 2) + '\n';
  writeIfNotExists(resolve(pluginDir, 'codapult-plugin.json'), manifest);
  success('codapult-plugin.json');

  // .gitignore
  writeIfNotExists(resolve(pluginDir, '.gitignore'), 'node_modules\ndist\n');
  success('.gitignore');

  // README
  const readme = `# @codapult/plugin-${kebab}

${pascal} plugin for Codapult.

## Installation

\`\`\`bash
npx @codapult/cli plugins add ${kebab}
\`\`\`

## Development

\`\`\`bash
pnpm install
pnpm tsc --noEmit
\`\`\`
`;
  writeIfNotExists(resolve(pluginDir, 'README.md'), readme);
  success('README.md');

  console.log();
  info(`Plugin scaffold created at: ${pluginDir}`);
  dim(`Install with: npx @codapult/cli plugins add ${kebab}`);
  console.log();
}
