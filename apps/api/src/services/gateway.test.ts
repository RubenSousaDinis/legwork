/**
 * `buildGateway()` follows `CHAIN_ID`: Base Sepolia by default, anvil with the fake facilitator
 * for the e2e harness — and never a network that disagrees with the chain.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../config';
import { buildGateway } from './hire';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

afterEach(() => resetConfigForTests());

describe('buildGateway', () => {
  it('runs the fake facilitator on anvil without a facilitator url', () => {
    resetConfigForTests({ CHAIN_ID: '31337', X402_FACILITATOR_MODE: 'fake', X402_FACILITATOR_URL: '', USDC_ADDRESS: USDC });
    expect(() => buildGateway()).not.toThrow();
  });

  it('refuses a network that does not match the chain', () => {
    resetConfigForTests({ CHAIN_ID: '31337', X402_FACILITATOR_MODE: 'fake', X402_NETWORK: 'eip155:84532', USDC_ADDRESS: USDC });
    expect(() => buildGateway()).toThrow(/X402_NETWORK must be eip155:31337/);
  });

  it('still needs a facilitator url in http mode', () => {
    resetConfigForTests({ X402_FACILITATOR_URL: '', USDC_ADDRESS: USDC });
    expect(() => buildGateway()).toThrow(/X402_FACILITATOR_URL/);
  });
});
