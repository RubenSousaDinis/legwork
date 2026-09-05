import { describe, expect, it } from 'vitest';
import { ConfigError, TEST_ENV, resetConfigForTests } from '../src/config';

describe('config', () => {
  it('names the missing variable and never its value', () => {
    let thrown: unknown;
    try {
      resetConfigForTests({ SESSION_SECRET: undefined });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    const error = thrown as ConfigError;
    expect(error.names).toEqual(['SESSION_SECRET']);
    expect(error.message).toContain('SESSION_SECRET');
  });

  it('names a short secret without quoting it', () => {
    const secret = 'far-too-short';
    let thrown: unknown;
    try {
      resetConfigForTests({ SESSION_SECRET: secret });
    } catch (err) {
      thrown = err;
    }

    const error = thrown as ConfigError;
    expect(error.names).toEqual(['SESSION_SECRET']);
    expect(error.message).not.toContain(secret);
  });

  it('never puts a key into the message it throws', () => {
    let thrown: unknown;
    try {
      resetConfigForTests({ RELAYER_PRIVATE_KEY: '0xnope' });
    } catch (err) {
      thrown = err;
    }

    const error = thrown as ConfigError;
    expect(error.names).toEqual(['RELAYER_PRIVATE_KEY']);
    expect(error.message).not.toContain('0xnope');
  });

  it('derives the three addresses and caps the long poll at 50 seconds', () => {
    const config = resetConfigForTests({ LONGPOLL_MAX_S: '600' });

    expect(config.LONGPOLL_MAX_S).toBe(50);
    expect(config.DEMO_DISPUTE_WINDOW_S).toBe(120);
    expect(config.CHAIN_ID).toBe(84532);
    expect(config.PAYMENT_MODE).toBe('x402');
    expect(config.DATA_MODE).toBe('live');
    expect(config.WORLD_CREDENTIAL_LEVEL).toBe('selfie');
    for (const address of [
      config.relayerAddress,
      config.attestationVerifierAddress,
      config.abuseMarkSignerAddress,
    ]) {
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    // Derived, never echoed: the three keys are still only in the parsed environment.
    expect(config.relayerAddress).not.toBe(TEST_ENV.RELAYER_PRIVATE_KEY);
  });

  it('refuses a chain other than Base Sepolia', () => {
    expect(() => resetConfigForTests({ CHAIN_ID: '1' })).toThrow(ConfigError);
  });
});
