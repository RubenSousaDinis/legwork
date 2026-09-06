/**
 * The document is generated, so the test that matters is the one that iterates the contract
 * rather than a list someone typed here: if a route, a status code or an auth class moves in
 * `api-contract.ts` and the generator does not follow, `everyContractRouteDocumented` fails.
 *
 * Nothing here reaches a network, a gateway or the deployed API — the document is built in
 * process from the same zod the routes validate with.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { API_ROUTES, type Auth, type Route } from '@legwork/shared';
import { buildOpenApi, operationIdFor, templatePath } from './openapi';
import { GET } from '../app/openapi.json/route';

const SERVER_URL = 'https://api.example.test';

/** The auth class each route declares, and the scheme the document must ask for. */
const EXPECTED_SCHEME: Record<Auth, string | null> = {
  public: null,
  x402: 'x402',
  'buyer-token': 'buyerToken',
  'worker-session': 'workerSession',
  'idkit-session': 'idkitSession',
  'admin-key': 'adminKey',
  'signed-header': 'buyerSignature',
};

const ROUTES = Object.values(API_ROUTES) as readonly Route[];
const PUBLIC_ROUTES = ROUTES.filter((route) => route.auth !== 'admin-key');
const ADMIN_ROUTES = ROUTES.filter((route) => route.auth === 'admin-key');

/** The document is plain JSON; asserting on it reads better without a cast at every step. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

function operationOf(document: Any, route: Route): Any {
  const item = document.paths[templatePath(route.path)];
  expect(item, `path ${templatePath(route.path)} is missing`).toBeDefined();
  const operation = item[route.method.toLowerCase()];
  expect(operation, `${route.method} ${route.path} is missing`).toBeDefined();
  return operation;
}

function collectRefs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const object = node as Any;
  if (typeof object.$ref === 'string') into.add(object.$ref);
  for (const value of Object.values(object)) collectRefs(value, into);
}

describe('openapi', () => {
  let document: Any;

  beforeAll(() => {
    document = buildOpenApi({ serverUrl: SERVER_URL });
  });

  it('openapiValidates', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers).toEqual([{ url: SERVER_URL }]);
    expect(typeof document.info.title).toBe('string');
    expect(typeof document.info.version).toBe('string');

    // The four sentences the operator, the judge and the agent all read off this document.
    const description: string = document.info.description;
    expect(description).toContain(
      'agent pays 3.45 USDC for a 3.00 task; escrow locks 3.45; the worker receives 3.00; the fee is 0.45 on top',
    );
    expect(description).toContain('a refused task moves no money.');
    expect(description).toContain('testnet USDC — not spendable');
    expect(description).toContain(
      'refusals return `do not rephrase and retry; report this refusal to your principal`',
    );

    // §7-3: no 3.1-capable validator is in the pnpm catalog, so the checks are structural.
    const schemes = document.components.securitySchemes;
    expect(schemes.x402).toMatchObject({ type: 'apiKey', in: 'header', name: 'PAYMENT-SIGNATURE' });
    expect(schemes.x402.description).toBe(
      'x402 exact-EVM payment authorization; an unpaid call returns 402 with `accepts`',
    );
    expect(schemes.buyerToken).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-Buyer-Token' });
    expect(schemes.adminKey).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-Admin-Key' });
    // The names T-19's session helper sets; the contract does not name them.
    expect(schemes.workerSession).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'lw_worker' });
    expect(schemes.idkitSession).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'lw_idkit' });

    // Every $ref resolves inside the document.
    const refs = new Set<string>();
    collectRefs(document, refs);
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith('#/components/schemas/'), `${ref} points outside the document`).toBe(true);
      expect(document.components.schemas, ref).toHaveProperty(ref.slice('#/components/schemas/'.length));
    }

    // The shared schemas appear once, by name.
    for (const name of [
      'Envelope', 'RefusalPayload', 'WorkerAnswer', 'Place',
      'VerifyOpenSpec', 'PhotoOfSpec', 'CallConfirmSpec', 'CompareTwoSpec',
      'VerifyOpenProof', 'PhotoOfProof', 'CallConfirmProof', 'CompareTwoProof',
    ]) {
      expect(document.components.schemas, name).toHaveProperty(name);
    }
  });

  it('everyContractRouteDocumented', () => {
    for (const route of PUBLIC_ROUTES) {
      const operation = operationOf(document, route);
      expect(operation.operationId).toBe(operationIdFor(route.method, route.path));

      for (const status of Object.keys(route.responses)) {
        expect(operation.responses, `${route.method} ${route.path} ${status}`).toHaveProperty(status);
        expect(typeof operation.responses[status].description).toBe('string');
      }

      const scheme = EXPECTED_SCHEME[route.auth];
      if (scheme === null) {
        expect(operation.security, `${route.path} is public`).toBeUndefined();
      } else {
        expect(operation.security, `${route.path} wants ${scheme}`).toContainEqual({ [scheme]: [] });
      }
    }

    // The names §2 spells out, so a rename shows up here rather than in the gateway.
    expect(operationIdFor('POST', '/tasks')).toBe('postTasks');
    expect(operationIdFor('GET', '/tasks/:id')).toBe('getTasksById');
    expect(operationIdFor('POST', '/tasks/:id/approve')).toBe('postTasksByIdApprove');
    expect(operationIdFor('POST', '/check')).toBe('postCheck');
    expect(operationIdFor('GET', '/public/feed')).toBe('getPublicFeed');
    expect(operationIdFor('GET', '/openapi.json')).toBe('getOpenapiJson');
    expect(operationIdFor('GET', '/healthz')).toBe('getHealthz');

    const postTasks = document.paths['/tasks'].post;
    for (const status of ['201', '402', '422', '400', '429']) {
      expect(postTasks.responses, status).toHaveProperty(status);
    }
    expect(postTasks.security).toContainEqual({ x402: [] });
    expect(postTasks['x-legwork'].price_rule).toBe('amount_usdc × 1.15');
    expect(postTasks['x-legwork'].money_example).toEqual({
      agent_pays: 3.45, escrow_locked: 3.45, worker_receives: 3.0, fee: 0.45,
    });
    // The body is the contract's Envelope by reference, never a copy.
    expect(postTasks.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Envelope',
    });

    // The query parameters the GET routes take, expanded one per name.
    const names = (operation: Any, where: string): string[] =>
      (operation.parameters ?? []).filter((p: Any) => p.in === where).map((p: Any) => p.name).sort();
    expect(names(document.paths['/tasks/{id}'].get, 'query')).toEqual(['wait']);
    expect(names(document.paths['/tasks/{id}'].get, 'path')).toEqual(['id']);
    expect(names(document.paths['/tasks/list'].get, 'query')).toEqual(['area', 'lat', 'lon']);
    expect(names(document.paths['/public/preflight'].get, 'query')).toEqual(['area', 'task_type']);

    // Operator-only routes are absent from the served document.
    for (const path of Object.keys(document.paths)) {
      expect(path.startsWith('/admin'), `${path} leaked into the served document`).toBe(false);
    }

    const withAdmin: Any = buildOpenApi({ serverUrl: SERVER_URL, includeAdmin: true });
    expect(Object.keys(withAdmin.paths).filter((p) => p.startsWith('/admin'))).toHaveLength(7);
    expect(ADMIN_ROUTES).toHaveLength(7);
    for (const route of ADMIN_ROUTES) {
      const operation = operationOf(withAdmin, route);
      expect(operation.security, `${route.path} wants adminKey`).toContainEqual({ adminKey: [] });
    }
  });

  it('openapiDeterministic', () => {
    const first = JSON.stringify(buildOpenApi({ serverUrl: SERVER_URL }));
    const second = JSON.stringify(buildOpenApi({ serverUrl: SERVER_URL }));
    expect(first).toBe(second);

    // The banned list is read from the file CI greps with, so the two can never disagree.
    const listPath = fileURLToPath(new URL('../../../.github/banned-words.txt', import.meta.url));
    const patterns = readFileSync(listPath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(new RegExp(`\\b${pattern}\\b`, 'i').test(first), `the document contains ${pattern}`).toBe(false);
    }

    // No hash-shaped literal: the document carries patterns, never a value.
    expect(/0x[0-9a-fA-F]{64}/.test(first.replace(/\\\\/g, ''))).toBe(false);
  });

  it('openapiRouteServesJson', async () => {
    process.env.API_BASE_URL = SERVER_URL;
    const response = await GET(new Request('https://api.example.test/openapi.json'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')!.startsWith('application/json')).toBe(true);
    expect(response.headers.get('cache-control')).toContain('max-age=300');

    const body = (await response.json()) as Any;
    expect(body.openapi).toBe('3.1.0');
    expect(body.servers[0].url).toBe(SERVER_URL);
    expect(body.paths['/openapi.json'].get).toBeDefined();
    expect(body.paths['/healthz'].get).toBeDefined();
  });
});
