import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { LOGGED_HEADERS, REDACTED, createLogger } from './redact';
import { request } from './testRequest';

/** The real logger, writing somewhere a test can read back. */
function capture() {
  const written: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) {
      written.push(String(chunk));
      done();
    },
  });
  return {
    log: createLogger({ level: 'info', base: null }, sink),
    raw: () => written.join(''),
    lines: () => written.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('redact', () => {
  it('redactsTokensAndKeys', () => {
    const { log, raw, lines } = capture();

    const req = request('/tasks/7/approve', {
      method: 'POST',
      headers: {
        'x-buyer-token': 'tok_abc',
        'x-admin-key': 'k_super_secret_admin_key_value_00',
        'payment-signature': 'sig_0xdeadbeef',
        cookie: 'lw_worker=cookie_value_nobody_may_read',
        authorization: 'Bearer bearer_value_nobody_may_read',
        'content-type': 'application/json',
        'user-agent': 'legwork-tests/1.0',
      },
    });

    log.info({ req, body: { buyer_token: 'tok_abc', privateKey: '0xdeadbeef' } }, 'approve');

    const text = raw();
    for (const leak of [
      'tok_abc',
      'k_super_secret_admin_key_value_00',
      'sig_0xdeadbeef',
      'cookie_value_nobody_may_read',
      'bearer_value_nobody_may_read',
      '0xdeadbeef',
    ]) {
      expect(text).not.toContain(leak);
    }

    const line = lines()[0] as Record<string, unknown>;
    const body = line.body as Record<string, unknown>;
    expect(body.buyer_token).toBe(REDACTED);
    expect(body.privateKey).toBe(REDACTED);

    // The header list is an allowlist, so the names of the dropped headers are gone too —
    // censoring them would still have printed `x-admin-key` next to `[REDACTED]`.
    const logged = line.req as { headers: Record<string, string>; method: string };
    expect(logged.method).toBe('POST');
    expect(Object.keys(logged.headers).every((h) => (LOGGED_HEADERS as readonly string[]).includes(h))).toBe(true);
    expect(logged.headers['content-type']).toBe('application/json');
    expect(logged.headers['user-agent']).toBe('legwork-tests/1.0');
    expect(logged.headers['x-buyer-token']).toBeUndefined();
    expect(logged.headers['x-admin-key']).toBeUndefined();
    expect(logged.headers.cookie).toBeUndefined();
  });
});
