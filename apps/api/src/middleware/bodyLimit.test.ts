import { beforeEach, describe, expect, it } from 'vitest';
import { BODY_CAPS, PayloadTooLargeError, readJsonWithCap } from './bodyLimit';
import { createMiddleware } from './edge';
import { MemoryRateLimitStore } from './rateLimit';
import { request } from './testRequest';

const store = new MemoryRateLimitStore();
const middleware = createMiddleware({
  env: { MINIAPP_URL: 'https://miniapp.legwork.test' },
  store,
  now: () => 1_700_000_000_000,
});

beforeEach(() => store.reset());

const post = (path: string, contentLength: number) =>
  middleware(
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(contentLength) },
    }),
  );

describe('bodyLimit', () => {
  it('bodyCapReturns413', async () => {
    const tooBig = await post('/check', 20_000);
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: 'payload_too_large', max_bytes: 16_384 });

    // 8 MiB exactly is the frozen proof limit, and is allowed; one byte more is not.
    expect((await post('/proofs', 8 * 1024 * 1024)).status).toBe(200);

    const overProof = await post('/proofs', 8 * 1024 * 1024 + 1);
    expect(overProof.status).toBe(413);
    expect(await overProof.json()).toEqual({
      error: 'payload_too_large',
      max_bytes: BODY_CAPS.proofs,
    });

    // A stream over the cap is refused while it is still being read: the tail is not valid
    // JSON, so a `SyntaxError` here would mean the parser had been reached.
    const streamed = new Request('https://api.legwork.test/check', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`{"spec":"${'x'.repeat(20_000)}`));
          controller.close();
        },
      }),
      // Node's fetch requires this for a streamed request body.
      duplex: 'half',
    } as RequestInit);

    await expect(readJsonWithCap(streamed, BODY_CAPS.json)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it('asks for a length on a JSON body that arrives without one, and lets a bodyless POST past', async () => {
    const unmeasured = await middleware(
      request('/check', { method: 'POST', headers: { 'content-type': 'application/json' } }),
    );
    expect(unmeasured.status).toBe(411);
    expect(await unmeasured.json()).toEqual({ error: 'length_required' });

    // `POST /tasks/:id/claim` carries no body at all and must not be asked to measure one.
    const bodyless = await middleware(request('/tasks/7/claim', { method: 'POST' }));
    expect(bodyless.status).toBe(200);
  });
});
