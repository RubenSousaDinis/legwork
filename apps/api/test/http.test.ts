/**
 * The wrappers every later route stands on: the error envelope, the two guards, and the one
 * route body this task ships besides the session path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as healthz } from '../app/healthz/route';
import { POST as tasksStub } from '../app/tasks/route';
import { resetConfigForTests } from '../src/config';
import { ApiError } from '../src/errors';
import { requireAdminKey } from '../src/http/adminKey';
import { clientKey, rateLimit, resetRateLimitForTests } from '../src/http/rateLimit';
import { route } from '../src/http/route';
import { call } from './app';
import { createTestDb, type TestDb } from './db';

const MINIAPP = 'https://miniapp.legwork.test';

let fixture: TestDb;

beforeEach(async () => {
  resetConfigForTests({ MINIAPP_URL: MINIAPP });
  resetRateLimitForTests();
  fixture = await createTestDb();
});

afterEach(async () => {
  await fixture.close();
});

describe('route', () => {
  it('turns an ApiError into its envelope and an unknown throw into a 500 with a request id', async () => {
    const conflict = route(async () => {
      throw ApiError.of('conflict', { reason: 'already_claimed' });
    });
    const boom = route(async () => {
      throw new Error('a stack the caller must never see');
    });

    const first = await call(conflict, { method: 'POST' });
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ error: 'conflict', reason: 'already_claimed' });

    const second = await call(boom, { method: 'POST' });
    expect(second.status).toBe(500);
    const body = (await second.json()) as { error: string; request_id: string };
    expect(body.error).toBe('internal');
    expect(body.request_id).toHaveLength(36);
    expect(JSON.stringify(body)).not.toContain('a stack the caller must never see');
  });

  it('answers a preflight and offers credentials only to a configured origin', async () => {
    const handler = route(async () => Response.json({ ok: true }));

    const allowed = await call(handler, { method: 'OPTIONS', headers: { origin: MINIAPP } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(MINIAPP);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const stranger = await call(handler, { headers: { origin: 'https://elsewhere.test' } });
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reports a stub as 501 not_implemented', async () => {
    const res = await call(tasksStub, { method: 'POST' });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'not_implemented' });
  });
});

describe('rateLimit', () => {
  it('throws rate_limited with a retry after the window fills', async () => {
    const key = 'test:one';
    rateLimit(key, { limit: 2, windowS: 60 });
    rateLimit(key, { limit: 2, windowS: 60 });

    let thrown: unknown;
    try {
      rateLimit(key, { limit: 2, windowS: 60 });
    } catch (err) {
      thrown = err;
    }

    const error = thrown as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.body()).toMatchObject({ error: 'rate_limited' });
    expect(error.extra?.retry_after_s).toBeGreaterThan(0);
  });

  it('keys on the first forwarded hop, and on local without a proxy', () => {
    expect(clientKey(new Request('http://localhost/'))).toBe('local');
    expect(
      clientKey(new Request('http://localhost/', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })),
    ).toBe('1.2.3.4');
  });
});

describe('requireAdminKey', () => {
  it('is a 404 while the admin surface is disabled', () => {
    resetConfigForTests();
    expect(() => requireAdminKey(new Request('http://localhost/'))).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  it('refuses a wrong key and accepts the configured one', () => {
    resetConfigForTests({ ADMIN_API_KEY: 'the-configured-admin-key' });

    expect(() =>
      requireAdminKey(new Request('http://localhost/', { headers: { 'x-admin-key': 'wrong' } })),
    ).toThrow(expect.objectContaining({ status: 401 }));

    expect(() =>
      requireAdminKey(
        new Request('http://localhost/', { headers: { 'x-admin-key': 'the-configured-admin-key' } }),
      ),
    ).not.toThrow();
  });
});

describe('healthz', () => {
  it('reports the database, the chain and the modes, and no address at all', async () => {
    const res = await call(healthz, { url: 'http://localhost/healthz' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      db: 'ok',
      chain_id: 84532,
      payment_mode: 'x402',
      data_mode: 'live',
      version: 'dev',
    });
    // Public route: nothing derived from a key belongs in it.
    expect(JSON.stringify(body)).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});
