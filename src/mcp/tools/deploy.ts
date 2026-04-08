import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findProjectRoot } from '../../utils/project.js';

function getRoot(): string {
  const root = findProjectRoot();
  if (!root) throw new Error('Not inside a Codapult project');
  return root;
}

export function registerDeployTools(server: McpServer): void {
  server.registerTool(
    'codapult_deploy_status',
    {
      title: 'Deploy Readiness',
      description:
        'Check deployment readiness: Dockerfile, vercel.json, Helm, Terraform, Pulumi, standalone output, Node engine',
      inputSchema: {},
    },
    async () => {
      const root = getRoot();

      const checks = [
        { name: 'Dockerfile', path: 'Dockerfile' },
        { name: 'docker-compose.yml', path: 'docker-compose.yml' },
        { name: 'vercel.json', path: 'vercel.json' },
        { name: 'Terraform (AWS)', path: 'infra/terraform/main.tf' },
        { name: 'Pulumi (AWS)', path: 'infra/pulumi/index.ts' },
        { name: 'Helm chart', path: 'infra/helm/codapult/Chart.yaml' },
        { name: '.env.local', path: '.env.local' },
      ].map(({ name, path }) => ({
        name,
        found: existsSync(resolve(root, path)),
      }));

      let standaloneOutput = false;
      const nextConfig = resolve(root, 'next.config.ts');
      if (existsSync(nextConfig)) {
        const content = readFileSync(nextConfig, 'utf-8');
        standaloneOutput = content.includes("output: 'standalone'");
      }

      let nodeEngine = '';
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      const engines = pkg.engines as Record<string, string> | undefined;
      if (engines?.node) nodeEngine = engines.node;

      const result = { checks, standaloneOutput, nodeEngine };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
