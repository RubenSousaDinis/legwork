/**
 * What every tool is handed, and what a caller hands `createLegworkMcp`.
 *
 * Two modes, one set of tools. **Hosted** is mounted at `/mcp` on the Task API and cannot
 * answer an x402 challenge, so its `hire_human` quotes a price and stops. **Local** runs from
 * `npx @legwork/mcp` with a buyer key and pays for real through the hook in `hireHuman`.
 * Nothing else changes between them: the same six tools, the same schemas, the same results.
 */
import type { z } from 'zod';
import type {
  HireHumanInput as HireHumanInputSchema,
  HireHumanHostedResult,
  HireHumanLocalResult,
  RefusalPayload,
} from '@legwork/shared';
import type { TokenStore } from './keychain';

export const MCP_SERVER_NAME = 'legwork';
export const MCP_SERVER_VERSION = '0.1.0';

/**
 * Placeholder hosts. The lead replaces both at merge with the deployed URLs; nothing in this
 * package hard-codes a host anywhere else, so those two lines are the whole change.
 */
export const DEFAULT_API_BASE = 'https://legwork-api.example.com';
export const DEFAULT_DASHBOARD_URL = 'https://legwork-dashboard.example.com';

export type McpMode = 'hosted' | 'local';

export type HireHumanInput = z.infer<typeof HireHumanInputSchema>;
export type HireHumanResult =
  | z.infer<typeof HireHumanLocalResult>
  | z.infer<typeof HireHumanHostedResult>
  | z.infer<typeof RefusalPayload>;

/**
 * The subgraph, reduced to the one method preflight needs. `@legwork/subgraph-client`'s
 * executor satisfies this structurally, so the API can pass its own configured client and a
 * test can pass a recorded fixture — neither this package nor a test ever opens a socket to
 * The Graph.
 */
export interface SubgraphSource {
  query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
}

/** T-28 plugs the paying hire in here; hosted mode never has one. */
export type LocalHireHandler = (
  input: HireHumanInput,
  ctx: ToolContext,
) => Promise<HireHumanResult>;

export interface LegworkMcpOptions {
  mode: McpMode;
  apiBase: string;
  dashboardUrl: string;
  subgraph?: SubgraphSource;
  tokenStore?: TokenStore;
  fetchImpl?: typeof fetch;
  hireHuman?: LocalHireHandler;
}

export interface ToolContext {
  mode: McpMode;
  apiBase: string;
  dashboardUrl: string;
  fetch: typeof fetch;
  tokenStore?: TokenStore;
  subgraph?: SubgraphSource;
  hireHuman?: LocalHireHandler;
}

/** Trailing slashes are the difference between `/tasks` and `//tasks`; strip them once, here. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function toolContext(opts: LegworkMcpOptions): ToolContext {
  const ctx: ToolContext = {
    mode: opts.mode,
    apiBase: trimTrailingSlash(opts.apiBase),
    dashboardUrl: trimTrailingSlash(opts.dashboardUrl),
    fetch: opts.fetchImpl ?? globalThis.fetch,
  };
  if (opts.tokenStore) ctx.tokenStore = opts.tokenStore;
  if (opts.subgraph) ctx.subgraph = opts.subgraph;
  if (opts.hireHuman) ctx.hireHuman = opts.hireHuman;
  return ctx;
}

/** Where a human goes to watch this task. Every result carries one. */
export function dashboardUrlFor(ctx: ToolContext, taskId?: string): string {
  return taskId ? `${ctx.dashboardUrl}/task/${taskId}` : ctx.dashboardUrl;
}
