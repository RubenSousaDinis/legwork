/**
 * `tools/list` is the contract, or it is nothing.
 *
 * The expectation is built by running the SDK's own converter over `mcp-contract.ts`'s zod,
 * never by pasting a snapshot: a hand-typed expectation would pass just as happily against a
 * schema this package had quietly re-typed, which is the exact drift the contract exists to
 * prevent.
 */
import { describe, expect, it } from 'vitest';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { MCP_TOOLS } from '@legwork/shared';
import { API_BASE, DASHBOARD_URL, connect } from './harness';

/** Exactly what `McpServer` publishes for a schema, derived from the contract's zod. */
function contractInputSchema(schema: unknown): unknown {
  const obj = normalizeObjectSchema(schema as never);
  return obj
    ? toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'input' })
    : { type: 'object', properties: {} };
}

function expected() {
  return Object.entries(MCP_TOOLS)
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: contractInputSchema(tool.input),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('mcpToolsListMatchesContract', () => {
  for (const mode of ['hosted', 'local'] as const) {
    it(`lists the six contract tools in ${mode} mode`, async () => {
      const harness = await connect({ mode, apiBase: API_BASE, dashboardUrl: DASHBOARD_URL });
      try {
        const listed = (await harness.client.listTools()).tools
          .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
          .sort((a, b) => a.name.localeCompare(b.name));

        expect(listed.map((t) => t.name)).toEqual([
          'approve_task',
          'check_task',
          'dispute_task',
          'hire_human',
          'preflight_workers',
          'task_status',
        ]);
        expect(listed).toEqual(expected());
      } finally {
        await harness.close();
      }
    });
  }

  it('lists the same tools in both modes', async () => {
    const hosted = await connect({ mode: 'hosted' });
    const local = await connect({ mode: 'local' });
    try {
      expect((await hosted.client.listTools()).tools).toEqual(
        (await local.client.listTools()).tools,
      );
    } finally {
      await hosted.close();
      await local.close();
    }
  });
});
