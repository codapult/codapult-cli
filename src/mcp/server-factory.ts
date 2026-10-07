import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGuardTools } from '@codapult/guard/mcp';
import { registerGuardPrompts } from '@codapult/guard/mcp/prompts';
import { registerGuardResources } from '@codapult/guard/mcp/resources';
import { registerProjectTools } from './tools/project.js';
import { registerDbTools } from './tools/db.js';
import { registerEnvTools } from './tools/env.js';
import { registerPluginTools } from './tools/plugins.js';
import { registerGenerateTools } from './tools/generate.js';
import { registerDeployTools } from './tools/deploy.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

/** Create the complete Codapult MCP server, including the integrated Guard surface. */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'codapult',
    version: packageJson.version,
  });

  registerProjectTools(server);
  registerDbTools(server);
  registerEnvTools(server);
  registerPluginTools(server);
  registerGenerateTools(server);
  registerDeployTools(server);
  registerPrompts(server);
  registerResources(server);
  registerGuardTools(server);
  registerGuardPrompts(server);
  registerGuardResources(server);

  return server;
}
