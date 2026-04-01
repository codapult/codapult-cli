import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerProjectTools } from './tools/project.js';
import { registerDbTools } from './tools/db.js';
import { registerEnvTools } from './tools/env.js';
import { registerPluginTools } from './tools/plugins.js';
import { registerGenerateTools } from './tools/generate.js';
import { registerDeployTools } from './tools/deploy.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';

const server = new McpServer({
  name: 'codapult',
  version: '0.1.0',
});

registerProjectTools(server);
registerDbTools(server);
registerEnvTools(server);
registerPluginTools(server);
registerGenerateTools(server);
registerDeployTools(server);
registerPrompts(server);
registerResources(server);

const transport = new StdioServerTransport();
await server.connect(transport);
