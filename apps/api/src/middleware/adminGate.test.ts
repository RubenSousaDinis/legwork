import { beforeEach, describe, expect, it } from 'vitest';
import { createMiddleware } from './edge';
import { MemoryRateLimitStore } from './rateLimit';
import { request } from './testRequest';

const KEY = 'a'.repeat(32);
const WRONG = 'b'.repeat(32);
const store = new MemoryRateLimitStore();

const withEnv = (env: Record<string, string | undefined>) =>
  createMiddleware({ env, store, now: () => 1_700_000_000_000 });

const pause = (headers: Record<string, string> = {}) =>
  request('/admin/pause', { method: 'POST', headers });

beforeEach(() => store.reset());

describe('adminGate', () => {
  it('adminDisabledWithoutKey', async () => {
    const off = withEnv({});

    // Absent, not forbidden: a 401 here would confirm the console exists.
    const anonymous = await off(pause());
    expect(anonymous.status).toBe(404);
    expect(await anonymous.json()).toEqual({ error: 'not_found' });

    // Presenting a key changes nothing — there is nothing to present it to.
    expect((await off(pause({ 'x-admin-key': KEY }))).status).toBe(404);

    // A key too short to be one is a placeholder, and reads as unset.
    const short = withEnv({ ADMIN_API_KEY: 'short-key' });
    expect((await short(pause({ 'x-admin-key': 'short-key' }))).status).toBe(404);

    const on = withEnv({ ADMIN_API_KEY: KEY });

    const missing = await on(pause());
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'unauthorized' });

    // Equal length, so the answer cannot have come from a length check.
    const wrong = await on(pause({ 'x-admin-key': WRONG }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });

    const right = await on(pause({ 'x-admin-key': KEY }));
    expect(right.status).toBe(200);
  });

  it('never puts CORS headers on an admin route, allowlisted origin or not', async () => {
    const on = withEnv({ ADMIN_API_KEY: KEY, MINIAPP_URL: 'https://miniapp.legwork.test' });

    const res = await on(
      pause({ 'x-admin-key': KEY, origin: 'https://miniapp.legwork.test' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
