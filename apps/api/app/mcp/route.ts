// OWNER: T-27
/**
 * The hosted mount: `https://<host>/mcp`, streamable HTTP, stateless.
 *
 * No SSE and no Redis — a resumable stream needs a store this deployment does not have, and a
 * stateless Streamable HTTP handler is what survives a serverless function that ends when the
 * response does. `maxDuration` is 60 because `task_status` long-polls up to 50 seconds and the
 * platform stops the function at 60; the two numbers have to be in that order.
 *
 * No API key on testnet: the read tools are free, and identity for a paid post is the x402
 * payment and the ERC-8004 id, never a header this route could be talked into trusting.
 */
import { createMcpHandler } from 'mcp-handler';
import { registerLegworkTools, type ToolRegistrar } from '@legwork/mcp/server';
import { createSubgraphClient } from '@legwork/subgraph-client';
import { getConfig } from '@/src/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** `task_status` waits up to LONGPOLL_MAX_S (50); the platform stops the function at 60. */
export const maxDuration = 60;

/** What `mcp-handler` hands its initializer. Named here so the callback below is never `any`. */
type InitializeServer = Parameters<typeof createMcpHandler>[0];

function handler(): (request: Request) => Promise<Response> {
  const config = getConfig();

  const initialize = (server: ToolRegistrar): void => {
    registerLegworkTools(server, {
      mode: 'hosted',
      apiBase: config.API_BASE_URL ?? 'http://localhost:3001',
      dashboardUrl: config.DASHBOARD_URL ?? 'http://localhost:3000',
      // Without a query URL there is no pool to count; `preflight_workers` then asks the
      // API's own `/public/preflight`, which answers zeros rather than inventing a median.
      ...(config.SUBGRAPH_QUERY_URL
        ? {
            subgraph: createSubgraphClient({
              url: config.SUBGRAPH_QUERY_URL,
              ...(config.GRAPH_API_KEY ? { apiKey: config.GRAPH_API_KEY } : {}),
            }),
          }
        : {}),
    });
  };

  return createMcpHandler(initialize as unknown as InitializeServer, {
    serverInfo: { name: 'legwork', version: '0.1.0' },
  });
}

/**
 * Built once per module load rather than per request: registering six tools on every call
 * would be work repeated for nothing, and the configuration cannot change between them.
 */
let cached: ((request: Request) => Promise<Response>) | undefined;
function mcp(request: Request): Promise<Response> {
  cached ??= handler();
  return cached(request);
}

export const GET = mcp;
export const POST = mcp;
export const DELETE = mcp;
