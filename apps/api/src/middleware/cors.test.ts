import { beforeEach, describe, expect, it } from 'vitest';
import { createMiddleware } from './edge';
import { MemoryRateLimitStore } from './rateLimit';
import { request } from './testRequest';

const MINIAPP = 'https://miniapp.legwork.test';
const DASHBOARD = 'https://dashboard.legwork.test/';

const store = new MemoryRateLimitStore();
const middleware = createMiddleware({
  env: { MINIAPP_URL: MINIAPP, DASHBOARD_URL: DASHBOARD },
  store,
  now: () => 1_700_000_000_000,
});

beforeEach(() => store.reset());

describe('cors', () => {
  it('corsRejectsUnknownOrigin', async () => {
    const evil = await middleware(
      request('/check', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    );
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: 'origin_not_allowed' });
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const preflight = await middleware(
      request('/check', { method: 'OPTIONS', headers: { origin: MINIAPP } }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(MINIAPP);
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(preflight.headers.get('Vary')).toBe('Origin');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,OPTIONS');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, X-Buyer-Token, PAYMENT-SIGNATURE',
    );
    expect(preflight.headers.get('Access-Control-Max-Age')).toBe('600');

    // A sandboxed frame, a `file://` page and a redirected form all send this. It is not an
    // origin anything can be allowlisted as.
    const nullOrigin = await middleware(
      request('/check', { method: 'OPTIONS', headers: { origin: 'null' } }),
    );
    expect(nullOrigin.status).toBe(403);
    expect(nullOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();

    // An agent, the local MCP server and curl send no `Origin` at all, and must keep working.
    const noOrigin = await middleware(request('/check', { method: 'POST' }));
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(noOrigin.headers.get('Vary')).toBeNull();
  });

  it('echoes the dashboard origin on a normal request and ignores its trailing slash', async () => {
    const res = await middleware(request('/public/feed', { headers: { origin: 'https://dashboard.legwork.test' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dashboard.legwork.test');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
