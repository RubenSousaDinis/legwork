/**
 * The paying hire, end to end, with no chain and no live facilitator anywhere.
 *
 * The harness below is not a mock of `POST /tasks` — it is the real `X402Gateway` from
 * `@legwork/payments` with `FakeFacilitator` behind it, mounted on a throwaway loopback
 * server. That is what makes the interesting assertions possible: that the first request
 * carries no credential, that `verify` runs before the screening verdict and `settle` only
 * after it, and that a refusal leaves `settle` uncalled — a refused task moves no money,
 * checked rather than asserted in prose.
 *
 * The buyer key is Anvil account #0, the test vector `anvil` prints on every start. It is
 * published, holds nothing, and signing EIP-3009 is typed data: offline, no RPC.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  ANVIL_ACCOUNT_0_PRIVATE_KEY,
  FakeFacilitator,
  REQUEST_HEADER,
  X402Gateway,
} from '@legwork/payments';
import {
  HireHumanLocalResult,
  INSTALL_LINE,
  NO_RETRY_SENTENCE,
  type RefusalPayload,
} from '@legwork/shared';
import {
  toolContext,
  type HireHumanInput,
  type HireHumanResult,
  type ToolContext,
} from '../context';
import { MemoryTokenStore, type TokenStore } from '../keychain';
import { createPayFetch, insertLines, localHire } from './hire';
import { withInsert } from '../../bin/legwork-mcp';
import { API_BASE, VERIFY_OPEN_ENVELOPE, connect, mockApi } from '../../test/harness';

const PAY_TO = '0x1111111111111111111111111111111111111111' as const;
/** Base Sepolia USDC — the x402 library's own default asset for `eip155:84532`. */
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const SPEC_HASH = `0x${'ab'.repeat(32)}`;
const DASHBOARD = 'https://dashboard.legwork.test';
const ISSUED_TOKEN = `tok_${'c'.repeat(40)}`;
const TASK_ID = '7';

const REFUSAL: RefusalPayload = {
  refused: true,
  class: 'credential fraud',
  reason: 'asks a stranger to read back a one-time code',
  rule_id: 'deny.otp',
  retryable: false,
  allowed_task_types: ['verify-open', 'photo-of', 'call-confirm', 'compare-two'],
  message: NO_RETRY_SENTENCE,
};

const envelope = VERIFY_OPEN_ENVELOPE as unknown as HireHumanInput;

// ------------------------------------------------------------------- harness

interface SeenExchange {
  headers: Record<string, string>;
  status: number;
  body: unknown;
}

/** Records what actually went over the wire, which is the only way to prove a header's absence. */
function recordingFetch(seen: SeenExchange[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input as RequestInfo, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const response = await fetch(request);
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
    seen.push({ headers, status: response.status, body });
    return response;
  };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function asRequest(req: IncomingMessage, origin: string, body: Buffer): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method ?? 'GET',
    headers,
    ...(body.length > 0 ? { body: body.toString('utf8') } : {}),
  });
}

async function reply(res: ServerResponse, response: Response): Promise<void> {
  const text = await response.text();
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(text);
}

interface TaskApi {
  server: Server;
  origin: string;
  facilitator: FakeFacilitator;
  /** The screening verdict this run should produce. Refusals happen after `verify`. */
  refuse: boolean;
  close(): Promise<void>;
}

/**
 * `POST /tasks` in the frozen order: `requirePayment` (402, or a verify that moves nothing)
 * → screen → `settle` → 201. The route itself is T-16's; this reproduces its contract so
 * the client can be driven against something that really answers an x402 challenge.
 */
async function startTaskApi(): Promise<TaskApi> {
  const facilitator = new FakeFacilitator();
  const gateway = new X402Gateway({ facilitator, payTo: PAY_TO, asset: USDC, network: 'eip155:84532' });

  const state = { refuse: false };
  const server = createServer((req, res) => {
    void (async () => {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const raw = await readBody(req);
      const request = asRequest(req, origin, raw);

      if (req.method !== 'POST' || new URL(request.url).pathname !== '/tasks') {
        await reply(res, Response.json({ error: 'not_found' }, { status: 404 }));
        return;
      }

      const body = JSON.parse(raw.toString('utf8')) as { task_type: never; amount_usdc: number };
      const quote = gateway.price(body);
      const gate = await gateway.requirePayment(request, quote, {
        remaining_budget: { open_tasks: 5, daily_usdc: 25 },
        resource: request.url,
      });
      if (gate.kind === 'payment_required') {
        await reply(res, Response.json(gate.body, { status: gate.status, headers: gate.headers }));
        return;
      }

      // Screening, stubbed. A refusal happens after `verify` and before `settle`: the
      // authorization was checked, no money moved, and none ever will for this task.
      if (state.refuse) {
        await reply(res, Response.json(REFUSAL, { status: 422 }));
        return;
      }

      await gateway.settle(gate.ctx);
      await reply(
        res,
        Response.json(
          {
            task_id: TASK_ID,
            buyer_token: ISSUED_TOKEN,
            status: 'open',
            spec_hash: SPEC_HASH,
            price_usdc: quote.price_usdc,
            eta_seconds: 900,
            poll_after_seconds: 30,
            dashboard_url: `${DASHBOARD}/task/${TASK_ID}`,
          },
          { status: 201 },
        ),
      );
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    server,
    origin,
    facilitator,
    get refuse() {
      return state.refuse;
    },
    set refuse(value: boolean) {
      state.refuse = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function payingContext(api: TaskApi, seen: SeenExchange[], tokenStore: TokenStore): ToolContext {
  return toolContext({
    mode: 'local',
    apiBase: api.origin,
    dashboardUrl: DASHBOARD,
    tokenStore,
    fetchImpl: createPayFetch(ANVIL_ACCOUNT_0_PRIVATE_KEY, recordingFetch(seen)),
  });
}

const paidRequests = (seen: SeenExchange[]): SeenExchange[] =>
  seen.filter((exchange) => REQUEST_HEADER.toLowerCase() in exchange.headers);

/** A `Writable` that keeps what it was given, minus the stream machinery nothing here uses. */
function collector(): { lines: string[]; stream: NodeJS.WritableStream } {
  const lines: string[] = [];
  const stream = {
    write(chunk: string): boolean {
      lines.push(...chunk.split('\n').filter((line) => line.length > 0));
      return true;
    },
  };
  return { lines, stream: stream as unknown as NodeJS.WritableStream };
}

// ------------------------------------------------------------ the paid path

describe('the paying hire', () => {
  let api: TaskApi;

  beforeAll(async () => {
    api = await startTaskApi();
  });
  afterAll(async () => {
    await api.close();
  });
  afterEach(() => {
    api.facilitator.reset();
    api.refuse = false;
  });

  it('localHirePaysAndStoresToken', async () => {
    const seen: SeenExchange[] = [];
    const tokenStore = new MemoryTokenStore();
    const result = await localHire(envelope, payingContext(api, seen, tokenStore));

    // The first request asks; only the retry pays.
    expect(seen).toHaveLength(2);
    expect(seen[0]?.headers).not.toHaveProperty(REQUEST_HEADER.toLowerCase());
    expect(seen[1]?.headers).toHaveProperty(REQUEST_HEADER.toLowerCase());

    // Verified once, settled once — and the 402 quoted 3.45 for a 3.00 errand.
    expect(api.facilitator.verifyCalls).toBe(1);
    expect(api.facilitator.settleCalls).toBe(1);
    expect(seen[0]?.status).toBe(402);
    expect((seen[0]?.body as { price_usdc: number }).price_usdc).toBe(3.45);
    expect(envelope.amount_usdc).toBe(3.0);

    // The token is kept; it is never part of what the agent is handed.
    expect(await tokenStore.get(TASK_ID)).toBe(ISSUED_TOKEN);
    expect(result).not.toHaveProperty('buyer_token');
    expect(result).toEqual({
      task_id: TASK_ID,
      status: 'open',
      eta_seconds: 900,
      poll_after_seconds: 30,
      dashboard_url: `${DASHBOARD}/task/${TASK_ID}`,
    });
    expect(HireHumanLocalResult.safeParse(result).success).toBe(true);
  });

  it('localHireRefusalMovesNoMoney', async () => {
    api.refuse = true;
    const seen: SeenExchange[] = [];
    const tokenStore = new MemoryTokenStore();
    const result = await localHire(envelope, payingContext(api, seen, tokenStore));

    expect(result).toEqual(REFUSAL);
    expect((result as RefusalPayload).message).toBe(NO_RETRY_SENTENCE);
    expect(result).not.toHaveProperty('isError');

    // Verified, never settled: the agent signed an authorization that was never charged.
    expect(api.facilitator.verifyCalls).toBe(1);
    expect(api.facilitator.settleCalls).toBe(0);
    expect(await tokenStore.get(TASK_ID)).toBeUndefined();

    // Exactly one paid attempt. A 422 is never retried and never rephrased.
    expect(seen).toHaveLength(2);
    expect(paidRequests(seen)).toHaveLength(1);
  });

  it('insertLinesFormat', async () => {
    const seen: SeenExchange[] = [];
    const stderr = collector();
    const stdout = collector();
    const handler = withInsert(localHire, true, stderr.stream);

    await handler(envelope, payingContext(api, seen, new MemoryTokenStore()));

    expect(stderr.lines).toHaveLength(3);
    for (const line of stderr.lines) expect(line.length).toBeLessThanOrEqual(72);
    expect(stderr.lines[0]).toContain('3.00 USDC');
    expect(stderr.lines[1]).toContain('3.45 USDC (3.00 + 0.45 fee)');
    expect(stderr.lines[2]).toContain('escrow locked 3.45');
    expect(stderr.lines[2]).toContain('task_id');
    expect(stdout.lines).toEqual([]);
  });

  it('keyNeverLogged', async () => {
    const captured: string[] = [];
    const sinks = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        captured.push(args.map(String).join(' '));
      }),
    );
    const stderr = collector();
    const seen: SeenExchange[] = [];

    try {
      const handler = withInsert(localHire, true, stderr.stream);
      const result = await handler(envelope, payingContext(api, seen, new MemoryTokenStore()));

      const address = privateKeyToAccount(ANVIL_ACCOUNT_0_PRIVATE_KEY).address;
      const everything = [
        ...captured,
        ...stderr.lines,
        JSON.stringify(result),
        // The request headers too: the key must not have travelled in one either.
        JSON.stringify(seen.map((exchange) => exchange.headers)),
      ].join('\n');

      expect(everything).not.toContain(ANVIL_ACCOUNT_0_PRIVATE_KEY);
      expect(everything.toLowerCase()).not.toContain(address.toLowerCase());
    } finally {
      for (const sink of sinks) sink.mockRestore();
    }
  });

  it('payFetchSignsOnlyAfterA402', async () => {
    // Nothing asks for payment: nothing is ever signed.
    const calls: Headers[] = [];
    const never: typeof fetch = async (input, init) => {
      calls.push(new Request(input as RequestInfo, init).headers);
      return Response.json({ ok: true }, { status: 200 });
    };
    const payFetch = createPayFetch(ANVIL_ACCOUNT_0_PRIVATE_KEY, never);
    await payFetch(`${api.origin}/tasks`, { method: 'POST', body: '{}' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.has(REQUEST_HEADER)).toBe(false);
  });
});

// ------------------------------------------------------- the API's own errors

describe('what the API refuses for other reasons', () => {
  const errors = setupServer();

  beforeAll(() => errors.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => errors.resetHandlers());
  afterAll(() => errors.close());

  function ctxFor(status: number, body: Record<string, unknown>): ToolContext {
    errors.use(http.post(`${API_BASE}/tasks`, () => HttpResponse.json(body, { status })));
    return toolContext({
      mode: 'local',
      apiBase: API_BASE,
      dashboardUrl: DASHBOARD,
      tokenStore: new MemoryTokenStore(),
      fetchImpl: createPayFetch(ANVIL_ACCOUNT_0_PRIVATE_KEY),
    });
  }

  it('passes a 400 back with the dashboard and stops', async () => {
    const body = { error: 'invalid_request', field: 'spec.place', reason: 'unknown place_id' };
    const result = (await localHire(envelope, ctxFor(400, body))) as unknown as Record<string, unknown>;

    expect(result).toMatchObject({ ...body, dashboard_url: DASHBOARD, isError: true });
    expect(result).not.toHaveProperty('task_id');
  });

  it('passes a cap back with the dashboard and stops', async () => {
    const body = { error: 'cap_exceeded', open_tasks: 5, daily_usdc: 25 };
    const result = (await localHire(envelope, ctxFor(429, body))) as unknown as Record<string, unknown>;

    expect(result).toMatchObject({ ...body, dashboard_url: DASHBOARD, isError: true });
  });

  it('names the step, not the exception, when the API cannot be reached', async () => {
    errors.use(http.post(`${API_BASE}/tasks`, () => HttpResponse.error()));
    const ctx = toolContext({
      mode: 'local',
      apiBase: API_BASE,
      dashboardUrl: DASHBOARD,
      fetchImpl: createPayFetch(ANVIL_ACCOUNT_0_PRIVATE_KEY),
    });

    const result = (await localHire(envelope, ctx)) as unknown as Record<string, unknown>;
    expect(result.error).toBe('api_unreachable');
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it('refuses an envelope the contract does not allow, without asking for money', async () => {
    const ctx = toolContext({
      mode: 'local',
      apiBase: API_BASE,
      dashboardUrl: DASHBOARD,
      fetchImpl: (() => {
        throw new Error('no request should go out');
      }) as unknown as typeof fetch,
    });

    const result = (await localHire(
      { ...envelope, amount_usdc: 0.5 } as HireHumanInput,
      ctx,
    )) as unknown as Record<string, unknown>;

    expect(result.error).toBe('invalid_request');
    expect(result.field).toBe('amount_usdc');
    expect(result.isError).toBe(true);
  });
});

// ------------------------------------------------------------- hosted mode

describe('hosted mode', () => {
  const api = mockApi();

  beforeAll(() => api.server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    api.server.resetHandlers();
    api.seen.length = 0;
  });
  afterAll(() => api.server.close());

  it('hostedHireNeverPays', async () => {
    const payFetch = vi.fn(async () => Response.json({ never: true }, { status: 200 }));
    const stored: string[] = [];
    const tokenStore: TokenStore = {
      get: async () => undefined,
      set: async (taskId) => {
        stored.push(taskId);
      },
    };

    const harness = await connect({
      mode: 'hosted',
      tokenStore,
      hireHuman: (input, ctx) =>
        localHire(input, { ...ctx, fetch: payFetch as unknown as typeof fetch }),
    });

    try {
      const result = (await harness.client.callTool({
        name: 'hire_human',
        arguments: VERIFY_OPEN_ENVELOPE,
      })) as { structuredContent: Record<string, unknown> };

      expect(result.structuredContent.payment_required).toBe(true);
      expect(result.structuredContent.install_line).toBe(INSTALL_LINE);
      expect(result.structuredContent).not.toHaveProperty('task_id');

      // The paying fetch is wired in and never reached: hosted mode cannot pay and does
      // not pretend to.
      expect(payFetch).not.toHaveBeenCalled();
      for (const request of api.seen) {
        expect(request.headerNames).not.toContain(REQUEST_HEADER.toLowerCase());
      }
      expect(stored).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

// ------------------------------------------------------------------- the bin

describe('the binary', () => {
  const TSX = fileURLToPath(new URL('../../../../node_modules/.bin/tsx', import.meta.url));
  const BIN = fileURLToPath(new URL('../../bin/legwork-mcp.ts', import.meta.url));

  function run(
    args: string[],
    env: Record<string, string | undefined>,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(TSX, [BIN, ...args], {
        env: { ...process.env, ...env } as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  it('binHelpPrints', async () => {
    const help = await run(['--help'], { BUYER_PRIVATE_KEY: undefined });

    expect(help.code).toBe(0);
    expect(help.stdout).toContain(INSTALL_LINE);
    expect(help.stdout).toContain('BUYER_PRIVATE_KEY');
    expect(help.stdout).toContain('~/.legwork/tokens.json');
    // A key never reaches the one output everybody pastes into an issue.
    expect(help.stdout).not.toMatch(/0x[0-9a-fA-F]{64}/);

    const noKey = await run([], { BUYER_PRIVATE_KEY: undefined });
    expect(noKey.code).toBe(2);
    expect(noKey.stderr).toContain('BUYER_PRIVATE_KEY is not set');
    expect(noKey.stdout).toBe('');
  }, 60_000);
});

// --------------------------------------------------------- the insert, alone

describe('insertLines', () => {
  const posted = {
    task_id: TASK_ID,
    status: 'open',
    eta_seconds: 900,
    poll_after_seconds: 30,
    dashboard_url: `${DASHBOARD}/task/${TASK_ID}`,
  } as HireHumanResult;

  it('says nothing for a result that is not a posted task', () => {
    expect(insertLines(envelope, REFUSAL)).toEqual([]);
  });

  it('shortens the place rather than the money when a name is long', () => {
    const spec = envelope.spec as { place: { name: string; locality: string } };
    const long = {
      ...envelope,
      spec: { ...spec, place: { ...spec.place, name: 'A'.repeat(120), locality: 'Marinha Grande' } },
    } as HireHumanInput;

    const [first] = insertLines(long, posted);
    expect(first?.length).toBeLessThanOrEqual(72);
    expect(first).toContain('3.00 USDC)');
    expect(first).toContain('...');
  });
});
