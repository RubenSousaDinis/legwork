import { z } from 'zod';
import { TASK_TYPES } from './enums.js';
import { LONGPOLL_MAX_S } from './constants.js';
import { Envelope } from './schemas/envelope.js';
import { RefusalPayload } from './schemas/refusal.js';
import { Preflight, TaskId, TaskView, TxResult, Geohash5 } from './api-contract.js';

/**
 * The six MCP tools, two modes. **Hosted** (`https://<host>/mcp`, read-only) cannot answer an
 * x402 challenge, so its `hire_human` returns `payment_required` with the install line.
 * **Local** (`npx @legwork/mcp` with BUYER_PRIVATE_KEY) pays the REST API via @x402/fetch and
 * runs all six for real. `docs/mcp.md` is rendered from this file.
 */
export const MCP_MODES = ['hosted', 'local'] as const;
export const INSTALL_LINE = 'claude mcp add legwork -- npx @legwork/mcp';

const TaskType = z.enum(TASK_TYPES);
const WithDashboard = { dashboard_url: z.url() };

export const HireHumanInput = Envelope; // same envelope as POST /tasks
export const HireHumanLocalResult = z.object({
  task_id: TaskId, status: z.literal('open'), eta_seconds: z.number().int(), poll_after_seconds: z.number().int().max(LONGPOLL_MAX_S), ...WithDashboard,
});
export const HireHumanHostedResult = z.object({
  payment_required: z.literal(true),
  endpoint: z.url(),
  price_usdc: z.number(),
  network: z.literal('eip155:84532'),
  asset: z.literal('USDC'),
  pay_to: z.string(),
  install_line: z.literal(INSTALL_LINE),
  ...WithDashboard,
});

export const MCP_TOOLS = {
  preflight_workers: {
    description: 'How many workers could take this task near this area: active (completed in the last 7 days), verified, seeded, and the median time — labelled seeded when it is.',
    input: z.object({ task_type: TaskType, area: Geohash5 }),
    output: Preflight,
    hosted: true, local: true,
  },
  hire_human: {
    description: 'Post a task and fund its escrow. Hosted mode cannot pay and returns payment_required with the local install line; local mode pays via x402 and returns the task.',
    input: HireHumanInput,
    output: z.union([HireHumanLocalResult, HireHumanHostedResult, RefusalPayload]),
    hosted: true, local: true,
  },
  task_status: {
    description: 'Current state of a task; long-polls up to wait_seconds. answer is always wrapped as untrusted worker data.',
    input: z.object({ task_id: TaskId, wait_seconds: z.number().int().min(0).max(LONGPOLL_MAX_S).default(0) }),
    output: TaskView,
    hosted: true, local: true,
  },
  approve_task: {
    description: 'Approve a submitted proof and release the escrow. Needs the buyer_token from hire_human (stored automatically in local mode).',
    input: z.object({ task_id: TaskId, buyer_token: z.string().optional() }),
    output: TxResult,
    hosted: true, local: true,
  },
  dispute_task: {
    description: 'Dispute a submitted proof inside the dispute window. Needs the buyer_token.',
    input: z.object({ task_id: TaskId, reason: z.string().max(300), buyer_token: z.string().optional() }),
    output: TxResult,
    hosted: true, local: true,
  },
  check_task: {
    description: 'Dry-run the screening for a task without posting or paying. Never marks.',
    input: z.object({ task_type: TaskType, spec: z.record(z.string(), z.unknown()) }),
    output: z.union([z.object({ accepted: z.literal(true), spec_hash: z.string(), price_usdc: z.number(), ...WithDashboard }), RefusalPayload]),
    hosted: true, local: true,
  },
} as const;

export type McpToolName = keyof typeof MCP_TOOLS;
