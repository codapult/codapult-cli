import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from './server-factory.js';

describe('Codapult MCP server contract', () => {
  it('registers the integrated Guard surface in the actual server', async () => {
    const server = createMcpServer();
    const client = new Client({ name: 'codapult-contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const [tools, resources, prompts] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listPrompts(),
    ]);

    expect(tools.tools.map((tool) => tool.name)).toContain('codapult_guard_init');
    expect(resources.resources.map((resource) => resource.name)).toContain('codapult_guard_rules');
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain(
      'codapult_guard_proposal_review',
    );

    await client.close();
    await server.close();
  });
});
