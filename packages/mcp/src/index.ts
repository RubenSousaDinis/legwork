/**
 * `@legwork/mcp` — the MCP server an agent talks to.
 *
 * Hosted at `/mcp` on the Task API for reads, or run locally with `npx @legwork/mcp` to pay
 * for real. T-28 imports `LocalHireHandler`, `toolResult` and the token store from here.
 */
export { createLegworkMcp, registerLegworkTools, LOCAL_HIRE_MISSING } from './server';
export type { ToolRegistrar } from './server';
export {
  DEFAULT_API_BASE,
  DEFAULT_DASHBOARD_URL,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  dashboardUrlFor,
  toolContext,
} from './context';
export type {
  HireHumanInput,
  HireHumanResult,
  LegworkMcpOptions,
  LocalHireHandler,
  McpMode,
  SubgraphSource,
  ToolContext,
} from './context';
export { toolError, toolResult } from './tools/result';
export type { ToolResult } from './tools/result';
export { DEFAULT_TOKEN_PATH, FileTokenStore, MemoryTokenStore } from './keychain';
export type { TokenStore } from './keychain';
export {
  ACTIVE_WINDOW_S,
  EMPTY_PREFLIGHT,
  PREFLIGHT_COMPLETIONS_QUERY,
  PREFLIGHT_WORKERS_QUERY,
  activeSince,
  computePreflight,
  fetchPreflight,
} from './preflight/index';
export type {
  PreflightArgs,
  PreflightCompletionRow,
  PreflightCounts,
  PreflightInput,
  PreflightWorkerRow,
} from './preflight/index';
export { BUYER_TOKEN_REQUIRED } from './tools/approve';
export { rewrapAnswer } from './tools/status';
