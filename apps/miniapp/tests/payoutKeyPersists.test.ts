import { beforeEach, describe, expect, it } from 'vitest';
import {
  exportPrivateKey,
  getPayoutAddress,
  importPrivateKey,
  loadOrCreatePayoutKey,
} from '../lib/workerKey';

/** A key nobody uses: 64 hex characters, and the address viem derives from it. */
const KNOWN_KEY = `0x${'59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'}`;
const KNOWN_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('workerKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('payoutKeyPersists', () => {
    const first = loadOrCreatePayoutKey();
    const second = loadOrCreatePayoutKey();
    expect(second.address).toBe(first.address);
    expect(getPayoutAddress()).toBe(first.address);

    // Clearing site data really does lose the key — which is what the warning card says.
    localStorage.clear();
    expect(getPayoutAddress()).toBeNull();
    expect(loadOrCreatePayoutKey().address).not.toBe(first.address);

    // And importing a known key gives back its known address.
    expect(importPrivateKey(KNOWN_KEY).address).toBe(KNOWN_ADDRESS);
    expect(getPayoutAddress()).toBe(KNOWN_ADDRESS);
    expect(exportPrivateKey()).toBe(KNOWN_KEY);

    // A malformed key is refused rather than stored.
    expect(() => importPrivateKey('0xnope')).toThrow();
    expect(exportPrivateKey()).toBe(KNOWN_KEY);
  });
});
