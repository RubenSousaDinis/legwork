/**
 * The six tools, registered once, served in both modes.
 *
 * Every schema here comes out of `@legwork/shared`'s `mcp-contract.ts` and is handed to the
 * SDK exactly as it is. Nothing is re-typed locally: a tool whose description or input shape
 * were maintained in two files would drift, and `docs/mcp.md`, `SKILL.md` and the OpenAPI
 * document are all rendered from that one contract.
 *
 * The only difference between hosted and local is what `hire_human` does. Hosted quotes a
 * price it cannot pay; local delegates to the handler T-28 installs. The other five behave
 * identically, which is what makes `tools/list` the same in both.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { z } from 'zod';
import { MCP_TOOLS } from '@legwork/shared';
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  dashboardUrlFor,
  toolContext,
  type HireHumanInput,
  type LegworkMcpOptions,
  type ToolContext,
} from './context';
import { approveTaskTool } from './tools/approve';
import { checkTaskTool, type CheckArgs } from './tools/check';
import { disputeTaskTool } from './tools/dispute';
import { hostedHireTool } from './tools/hire-hosted';
import { preflightWorkersTool } from './tools/preflight';
import { toolError, type ToolResult } from './tools/result';
import { taskStatusTool, type StatusArgs } from './tools/status';
import type { PreflightArgs } from './preflight/index';

export const LOCAL_HIRE_MISSING = 'local hire_human is not wired in this build';

/**
 * The slice of an MCP server this package uses. Declaring it structurally lets the same
 * registration run against the SDK's `McpServer` and against the server instance
 * `mcp-handler` builds for the hosted mount, which come from different packages.
 */
export interface ToolRegistrar {
  registerTool(
    name: string,
    config: { description?: string; inputSchema?: unknown; outputSchema?: unknown },
    cb: (args: never, extra: unknown) => Promise<unknown>,
  ): unknown;
}

type Handler = (args: never) => Promise<ToolResult<unknown>>;

function handlers(ctx: ToolContext): Record<keyof typeof MCP_TOOLS, Handler> {
  return {
    preflight_workers: ((args: PreflightArgs) =>
      preflightWorkersTool(ctx, args)) as unknown as Handler,

    check_task: ((args: CheckArgs) => checkTaskTool(ctx, args)) as unknown as Handler,

    task_status: ((args: StatusArgs) => taskStatusTool(ctx, args)) as unknown as Handler,

    approve_task: ((args: { task_id: string; buyer_token?: string }) =>
      approveTaskTool(ctx, args)) as unknown as Handler,

    dispute_task: ((args: { task_id: string; reason: string; buyer_token?: string }) =>
      disputeTaskTool(ctx, args)) as unknown as Handler,

    hire_human: (async (input: HireHumanInput) => {
      if (ctx.mode === 'hosted') return hostedHireTool(ctx, input);
      if (!ctx.hireHuman) {
        return toolError(LOCAL_HIRE_MISSING, { dashboard_url: dashboardUrlFor(ctx) });
      }
      const result = await ctx.hireHuman(input, ctx);
      // A local hire that failed (a 400, a cap, an unreachable API) comes back with `isError`
      // on the payload; hoisting it onto the tool result is what lets `contractChecked` skip a
      // shape the `hire_human` output union does not describe, and what tells the agent to stop.
      const failed = (result as { isError?: unknown }).isError === true;
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
        ...(failed ? { isError: true as const } : {}),
      };
    }) as unknown as Handler,
  };
}

/**
 * `hire_human` and `check_task` answer with a union — a result, or a refusal. The SDK can only
 * advertise and validate an *object* schema, and hands a union straight to a parser that is
 * not there. So the union is enforced here instead, against the same contract schema, and only
 * the object-shaped four are handed to the SDK. No schema is re-typed either way: what a tool
 * returns is still exactly what `mcp-contract.ts` says it may.
 */
function advertisable(schema: unknown): unknown | undefined {
  return normalizeObjectSchema(schema as never) ? schema : undefined;
}

function contractChecked(name: keyof typeof MCP_TOOLS, handler: Handler): Handler {
  const output = MCP_TOOLS[name].output as unknown as z.ZodType;
  return (async (args: never) => {
    const result = await handler(args);
    // An `isError` result is an instruction to the agent, not a tool answer; the contract's
    // output shape does not describe it, and the SDK skips it for the same reason.
    if (result.isError) return result;
    const parsed = output.safeParse(result.structuredContent);
    if (!parsed.success) {
      throw new Error(`${name} produced a result mcp-contract.ts does not allow`);
    }
    return result;
  }) as unknown as Handler;
}

/** Register the six on any server that speaks `registerTool`. */
export function registerLegworkTools(server: ToolRegistrar, opts: LegworkMcpOptions): ToolContext {
  const ctx = toolContext(opts);
  const bound = handlers(ctx);

  for (const name of Object.keys(MCP_TOOLS) as (keyof typeof MCP_TOOLS)[]) {
    const tool = MCP_TOOLS[name];
    const config: { description?: string; inputSchema?: unknown; outputSchema?: unknown } = {
      description: tool.description,
      inputSchema: tool.input,
    };
    const outputSchema = advertisable(tool.output);
    if (outputSchema) config.outputSchema = outputSchema;

    server.registerTool(
      name,
      config,
      contractChecked(name, bound[name]) as (args: never, extra: unknown) => Promise<unknown>,
    );
  }

  return ctx;
}

export function createLegworkMcp(opts: LegworkMcpOptions): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  registerLegworkTools(server as unknown as ToolRegistrar, opts);
  return server;
}
