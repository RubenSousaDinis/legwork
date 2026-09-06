/**
 * One in-memory client, one mocked Task API, no sockets.
 *
 * `msw` answers the five REST calls this package makes and records what it saw, which is how
 * the hosted-hire test can prove a request went out *without* a payment header — an assertion
 * you cannot make against a response body alone.
 */
import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { NO_RETRY_SENTENCE } from '@legwork/shared';
import { createLegworkMcp } from '../src/server';
import type { LegworkMcpOptions } from '../src/context';

export const API_BASE = 'https://api.legwork.test';
export const DASHBOARD_URL = 'https://dashboard.legwork.test';
export const PAY_TO = '0x000000000000000000000000000000000000dEaD';
const HASH = `0x${'ab'.repeat(32)}`;

/** A valid `verify-open` envelope at the posted rate the worker keeps: 3.00. */
export const VERIFY_OPEN_ENVELOPE = {
  task_type: 'verify-open' as const,
  spec: {
    place: {
      place_id: 'node/1234567',
      name: 'Cafe Sul',
      street_address: 'Rua Direita 12',
      locality: 'Leiria',
      country: 'PT' as const,
    },
    question: 'open_now' as const,
    claimed_open: true,
    claimed_hours: null,
    source: 'osm' as const,
  },
  amount_usdc: 3.0,
};

/** The agent pays 3.45 for a 3.00 errand: the 15 % fee sits on top and the worker keeps 3.00. */
export const PRICE_USDC = 3.45;

export const REFUSAL = {
  refused: true as const,
  class: 'credential fraud' as const,
  reason: 'asks a stranger to read back a one-time code',
  rule_id: 'deny.otp',
  retryable: false as const,
  allowed_task_types: ['verify-open', 'photo-of', 'call-confirm', 'compare-two'] as const,
  message: NO_RETRY_SENTENCE,
};

export function taskView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    task_id: '7',
    status: 'submitted',
    task_type: 'verify-open',
    amount_usdc: 3.0,
    fee_usdc: 0.45,
    area: 'ez5ku',
    posted_at: '2026-09-01T10:00:00.000Z',
    claimed_at: '2026-09-01T10:04:00.000Z',
    submitted_at: '2026-09-01T10:15:00.000Z',
    tx: { post: HASH, claim: HASH, submit: HASH },
    dashboard_url: `${DASHBOARD_URL}/task/7`,
    changed: true,
    poll_after_seconds: 3,
    ...overrides,
  };
}

export interface SeenRequest {
  method: string;
  url: string;
  headerNames: string[];
  headers: Record<string, string>;
  body: unknown;
}

export interface MockApi {
  server: ReturnType<typeof setupServer>;
  seen: SeenRequest[];
  /** Replace the `POST /check` answer for one test. */
  checkResponse: { status: number; body: Record<string, unknown> };
  taskResponse: Record<string, unknown>;
}

async function record(seen: SeenRequest[], request: Request): Promise<void> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    body = undefined;
  }
  seen.push({
    method: request.method,
    url: request.url,
    headerNames: Object.keys(headers),
    headers,
    body,
  });
}

export function mockApi(): MockApi {
  const seen: SeenRequest[] = [];
  const state: MockApi = {
    server: undefined as unknown as ReturnType<typeof setupServer>,
    seen,
    checkResponse: { status: 200, body: { accepted: true, spec_hash: HASH, price_usdc: PRICE_USDC } },
    taskResponse: taskView(),
  };

  const handlers: HttpHandler[] = [
    http.post(`${API_BASE}/check`, async ({ request }) => {
      await record(seen, request);
      return HttpResponse.json(state.checkResponse.body, { status: state.checkResponse.status });
    }),
    http.post(`${API_BASE}/tasks`, async ({ request }) => {
      await record(seen, request);
      return HttpResponse.json(
        {
          error: 'payment_required',
          price_usdc: PRICE_USDC,
          accepts: [{ scheme: 'exact', network: 'eip155:84532', payTo: PAY_TO, asset: 'USDC' }],
          remaining_budget: { open_tasks: 5, daily_usdc: 25 },
        },
        { status: 402 },
      );
    }),
    http.get(`${API_BASE}/tasks/:id`, async ({ request }) => {
      await record(seen, request);
      return HttpResponse.json(state.taskResponse);
    }),
    http.post(`${API_BASE}/tasks/:id/approve`, async ({ request, params }) => {
      await record(seen, request);
      return HttpResponse.json({ task_id: String(params.id), status: 'released', tx: HASH });
    }),
    http.post(`${API_BASE}/tasks/:id/dispute`, async ({ request, params }) => {
      await record(seen, request);
      return HttpResponse.json({ task_id: String(params.id), status: 'disputed', tx: HASH });
    }),
    http.get(`${API_BASE}/public/preflight`, async ({ request }) => {
      await record(seen, request);
      return HttpResponse.json({
        active: 4,
        verified: 1,
        seeded: 3,
        median_minutes: 11,
        median_source: 'real',
        n_real: 1,
        score_floor: 5,
        dashboard_url: DASHBOARD_URL,
      });
    }),
  ];

  state.server = setupServer(...handlers);
  return state;
}

export interface Harness {
  client: Client;
  close(): Promise<void>;
}

export async function connect(opts: Partial<LegworkMcpOptions> = {}): Promise<Harness> {
  const server = createLegworkMcp({
    mode: 'hosted',
    apiBase: API_BASE,
    dashboardUrl: DASHBOARD_URL,
    ...opts,
  } as LegworkMcpOptions);

  const client = new Client({ name: 'legwork-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}
