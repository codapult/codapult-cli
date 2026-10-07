import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server-factory.js';

const transport = new StdioServerTransport();
await createMcpServer().connect(transport);
