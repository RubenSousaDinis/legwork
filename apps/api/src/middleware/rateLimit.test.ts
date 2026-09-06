import { beforeEach, describe, expect, it } from 'vitest';
import { createMiddleware } from './edge';
import { MemoryRateLimitStore } from './rateLimit';
import { request } from './testRequest';

const env = { MINIAPP_URL: 'https://miniapp.legwork.test' };
const store = new MemoryRateLimitStore();

/** The injected clock: a test advances a minute rather than waiting one. */
let clock = 1_700_000_000_000;

const middleware = createMiddleware({ env, store, now: () => clock });

beforeEach(() => {
  store.reset();
  clock = 1_700_000_000_000;
});

const check = (ip: string) => middleware(request('/check', { method: 'POST', headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }));

describe('rateLimit', () => {
  it('rateLimitReturns429', async () => {
    // 30 per minute per IP on the free screening route.
    for (let i = 0; i < 30; i += 1) {
      const res = await check('203.0.113.7');
      expect(res.status).toBe(200);
    }

    const limited = await check('203.0.113.7');
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: string; retry_after_s: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retry_after_s).toBeGreaterThan(0);
    expect(limited.headers.get('Retry-After')).toBe(String(body.retry_after_s));

    // The limit is on that IP, not on the route.
    expect((await check('198.51.100.4')).status).toBe(200);

    // A minute later the window has slid past every one of those hits.
    clock += 60_000;
    expect((await check('203.0.113.7')).status).toBe(200);
  });

  it('holds a worker session to 10 proofs a minute however many addresses it comes from', async () => {
    const proofs = (ip: string) =>
      middleware(
        request('/proofs', {
          method: 'POST',
          headers: { 'x-forwarded-for': ip, cookie: 'lw_worker=session-token-value' },
        }),
      );

    // A different IP every time: the session key is what is being counted, and it is the
    // hash of the cookie rather than the cookie itself.
    for (let i = 0; i < 10; i += 1) {
      expect((await proofs(`203.0.113.${i}`)).status).toBe(200);
    }

    const limited = await proofs('203.0.113.99');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: 'rate_limited' });

    // Another session on one of the same addresses is unaffected.
    const other = await middleware(
      request('/proofs', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.0', cookie: 'lw_worker=a-different-token' },
      }),
    );
    expect(other.status).toBe(200);
  });
});
