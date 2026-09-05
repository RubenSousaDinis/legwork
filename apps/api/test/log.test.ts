import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED, REDACT_PATHS } from '../src/log';

/** The same redaction list, writing somewhere a test can read. */
function capture(): { log: pino.Logger; lines: () => Record<string, unknown>[] } {
  const written: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) {
      written.push(String(chunk));
      done();
    },
  });
  const log = pino(
    { level: 'info', redact: { paths: [...REDACT_PATHS], censor: REDACTED } },
    sink,
  );
  return { log, lines: () => written.map((l) => JSON.parse(l) as Record<string, unknown>) };
}

describe('log', () => {
  it('censors a spec and a buyer token, at the top level and one level down', () => {
    const { log, lines } = capture();

    log.info({
      spec: 'go to the corner shop and photograph the opening hours',
      buyer_token: 'bt_live_should_never_appear',
      task: {
        spec: 'nested spec text',
        spec_json: { text: 'nested spec json' },
        buyer_token: 'bt_nested',
      },
      spec_hash: '0xabc',
    });

    const line = lines()[0] as Record<string, unknown>;
    expect(line.spec).toBe(REDACTED);
    expect(line.buyer_token).toBe(REDACTED);
    const task = line.task as Record<string, unknown>;
    expect(task.spec).toBe(REDACTED);
    expect(task.spec_json).toBe(REDACTED);
    expect(task.buyer_token).toBe(REDACTED);
    // The hash is the field a route is meant to log, and it survives.
    expect(line.spec_hash).toBe('0xabc');
    expect(JSON.stringify(line)).not.toContain('corner shop');
    expect(JSON.stringify(line)).not.toContain('bt_live_should_never_appear');
  });

  it('censors credentials in request headers, a signature and a key', () => {
    const { log, lines } = capture();

    log.info({
      req: {
        headers: {
          cookie: 'lw_worker=secret',
          authorization: 'Bearer secret',
          'payment-signature': 'sig',
          'x-buyer-token': 'bt',
          'x-admin-key': 'admin',
          'user-agent': 'legwork-test',
        },
      },
      signature: '0xdeadbeef',
      payload: { anything: 'at all' },
      RELAYER_PRIVATE_KEY: '0x1111',
      wallet: { privateKey: '0x2222' },
    });

    const line = lines()[0] as Record<string, unknown>;
    const headers = (line.req as { headers: Record<string, unknown> }).headers;
    for (const name of ['cookie', 'authorization', 'payment-signature', 'x-buyer-token', 'x-admin-key']) {
      expect(headers[name]).toBe(REDACTED);
    }
    expect(headers['user-agent']).toBe('legwork-test');
    expect(line.signature).toBe(REDACTED);
    expect(line.payload).toBe(REDACTED);
    expect(line.RELAYER_PRIVATE_KEY).toBe(REDACTED);
    expect((line.wallet as Record<string, unknown>).privateKey).toBe(REDACTED);
  });
});
