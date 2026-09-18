import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkProjectRoot, readProjectFile } from '../../utils/project.js';
import { getProjectEnvOptions, loadProjectEnv } from '../../utils/project-env.js';
import {
  getAdapters,
  getAuthMethods,
  getFeatures,
  getOauthProviders,
} from '../../utils/env-config.js';
import { envSourceSchema } from './schemas.js';
import { commandResponse, runProjectCommand } from '../../utils/command.js';
import { runProjectChecks } from '../../utils/project-checks.js';
import { collectMcpHealth } from '../../utils/health.js';
import { collectAppConfigSummary } from '../../utils/config-report.js';

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'codapult_project_status',
    {
      title: 'Project Status',
      description:
        'Get Codapult project status: variant, adapters, installed plugins, enabled features, git status',
      inputSchema: {
        env_source: envSourceSchema.optional(),
      },
    },
    ({ env_source }) => {
      const root = checkProjectRoot('throw');
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as Record<
        string,
        unknown
      >;

      const envContent = loadProjectEnv(root, getProjectEnvOptions(env_source)).content;

      const pluginsDir = resolve(root, 'src/plugins');
      const plugins = existsSync(pluginsDir)
        ? readdirSync(pluginsDir)
            .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
            .map((f) => f.replace('.ts', ''))
        : [];

      let gitBranch = '';
      let gitDirty = false;
      try {
        gitBranch = execSync('git branch --show-current', { cwd: root, stdio: 'pipe' })
          .toString()
          .trim();
        const status = execSync('git status --porcelain', { cwd: root, stdio: 'pipe' })
          .toString()
          .trim();
        gitDirty = status.length > 0;
      } catch {
        /* not a git repo */
      }

      const features = getFeatures(envContent);

      const result = {
        name: pkg.name as string,
        version: pkg.version as string,
        adapters: getAdapters(envContent),
        authMethods: getAuthMethods(envContent),
        oauthProviders: getOauthProviders(envContent),
        plugins,
        features: {
          enabled: Object.keys(features).filter((k) => features[k]),
          disabled: Object.keys(features).filter((k) => !features[k]),
        },
        git: { branch: gitBranch, dirty: gitDirty },
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_project_config',
    {
      title: 'Project Config',
      description: 'Read the app configuration from src/config/app.ts (brand, company)',
    },
    () => {
      const root = checkProjectRoot('throw');
      const content = readProjectFile(root, 'src/config/app.ts') ?? 'Config file not found';
      return { content: [{ type: 'text' as const, text: content }] };
    },
  );

  server.registerTool(
    'codapult_run_checks',
    {
      title: 'Run Checks',
      description: 'Run lint, typecheck, and/or test. Returns structured pass/fail results.',
      inputSchema: {
        checks: z
          .array(z.enum(['lint', 'typecheck', 'test']))
          .optional()
          .describe('Which checks to run (default: all)'),
      },
    },
    ({ checks }) => {
      const root = checkProjectRoot('throw');
      const toRun = checks ?? ['lint', 'typecheck', 'test'];
      const results = runProjectChecks(root, toRun);

      return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_doctor',
    {
      title: 'Doctor',
      description:
        'Run project health checks: file structure, env vars, dependencies, TypeScript, git',
      inputSchema: {
        env_source: envSourceSchema.optional(),
      },
    },
    ({ env_source }) => {
      const root = checkProjectRoot('throw');
      const report = collectMcpHealth(root, {
        envSource: env_source,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
    },
  );

  server.registerTool(
    'codapult_project_context',
    {
      title: 'Project Context',
      description:
        'Get a compact, structured overview of the current Codapult project for AI-assisted work',
      inputSchema: {},
    },
    () => {
      const root = checkProjectRoot('throw');
      const packageJson = JSON.parse(
        readFileSync(resolve(root, 'package.json'), 'utf-8'),
      ) as Record<string, unknown>;
      const files = ['AGENTS.md', '.env.example', 'src/config/app.ts', 'src/config/env.ts'];
      const existingFiles = files.filter((file) => existsSync(resolve(root, file)));
      const envContent = loadProjectEnv(root).content;
      const adapters = getAdapters(envContent);
      const features = getFeatures(envContent);
      const configDir = resolve(root, 'src/config');
      const configFiles = existsSync(configDir)
        ? readdirSync(configDir)
            .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
            .sort()
        : [];
      const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
      const dependencies = {
        ...((packageJson.dependencies ?? {}) as Record<string, string>),
        ...((packageJson.devDependencies ?? {}) as Record<string, string>),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                root,
                name: packageJson.name,
                version: packageJson.version,
                scripts,
                dependencies,
                existingFiles,
                configFiles,
                adapters,
                enabledFeatures: Object.keys(features).filter((key) => features[key]),
                appConfig: collectAppConfigSummary(root),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codapult_build',
    {
      title: 'Build Project',
      description: 'Run the production build and return structured stdout, stderr, and exit code',
      inputSchema: {},
    },
    () =>
      commandResponse(
        runProjectCommand('pnpm build', checkProjectRoot('throw'), { timeout: 300_000 }),
      ),
  );
}
