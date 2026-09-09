/**
 * Drive the local MCP binary once and keep what it printed to stderr with LEGWORK_INSERT=1.
 *
 * The Agent SDK does not forward an MCP server's stderr to its consumer, so the three-line hire
 * card cannot be read from inside a scene. This connects to the same binary as a plain MCP
 * client, posts one real task, and prints the lines the binary wrote — nothing is composed here.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const note = JSON.parse(readFileSync(`${ROOT}/examples/fixtures/inbox-hire.json`, 'utf8')) as {
  place: Record<string, unknown>;
};

const key = process.env['BUYER_PRIVATE_KEY'];
if (!key) throw new Error('BUYER_PRIVATE_KEY is not set');

const transport = new StdioClientTransport({
  command: 'tsx',
  args: ['packages/mcp/bin/legwork-mcp.ts', '--mode', 'local'],
  cwd: ROOT,
  env: {
    BUYER_PRIVATE_KEY: key,
    LEGWORK_INSERT: '1',
    LEGWORK_API_URL: process.env['LEGWORK_API_URL'] ?? process.env['API_BASE_URL'] ?? '',
    LEGWORK_DASHBOARD_URL: process.env['LEGWORK_DASHBOARD_URL'] ?? '',
    BUYER_AGENT_ID: process.env['BUYER_AGENT_ID'] ?? '',
    PATH: `${ROOT}/node_modules/.bin:${process.env['PATH'] ?? ''}`,
  },
  stderr: 'pipe',
});

const lines: string[] = [];
const client = new Client({ name: 'legwork-insert-capture', version: '0.0.0' });
await client.connect(transport);
transport.stderr?.on('data', (chunk: Buffer) => {
  for (const line of chunk.toString().split('\n')) if (line.trim()) lines.push(line);
});

const result = (await client.callTool({
  name: 'hire_human',
  arguments: {
    task_type: 'verify-open',
    spec: {
      place: note.place,
      question: 'open_now',
      claimed_open: null,
      claimed_hours: null,
      source: 'none',
    },
    amount_usdc: 3,
    agent_id: process.env['BUYER_AGENT_ID'],
  },
})) as { structuredContent?: Record<string, unknown> };

await new Promise((r) => setTimeout(r, 1500));
console.log('--- tool result ---');
console.log(JSON.stringify(result.structuredContent));
console.log('--- binary stderr ---');
for (const line of lines) console.log(line);
await client.close();
