import { describe, expect, it, beforeEach } from 'vitest';
import { recoverTypedDataAddress, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { withdrawFeeOn } from '@legwork/shared';
import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  TREASURY_ADDRESS,
  USDC_ADDRESS,
  USDC_CHAIN_ID,
  USDC_DOMAIN_NAME,
  USDC_DOMAIN_VERSION,
  importPrivateKey,
  signWithdrawal,
} from '../../lib/workerKey';

/**
 * `signWithdrawal`, which is where this feature is either safe or it is not.
 *
 * Two properties, and the second one is the point of the whole task. The key stays in the
 * module: it goes in through `localStorage`, it is used, and nothing that comes back out
 * carries it. And both recipients are decided on the phone — the payout leg's from the
 * argument the worker's own typing produced, the fee leg's from a constant — so there is no
 * shape of server response, and no shape of argument, that redirects either one.
 */

const KEY = generatePrivateKey();
const WORKER = privateKeyToAccount(KEY).address;

/** Where the worker is moving it to: the other wallet on their phone. */
const DESTINATION = '0x1234567890AbcdEF1234567890aBcdef12345678' as const;

/** The address a compromised API would want in a `to` field. */
const ATTACKER = '0x000000000000000000000000000000000000dEaD' as const;

const domain = {
  name: USDC_DOMAIN_NAME,
  version: USDC_DOMAIN_VERSION,
  chainId: USDC_CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
} as const;

type Leg = Awaited<ReturnType<typeof signWithdrawal>>['payout'];

/** Recovers the signer from a leg the same way the API does, offline. */
function signerOf(leg: Leg): Promise<`0x${string}`> {
  return recoverTypedDataAddress({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: leg.from,
      to: leg.to,
      value: BigInt(leg.value),
      validAfter: BigInt(leg.valid_after),
      validBefore: BigInt(leg.valid_before),
      nonce: leg.nonce as Hex,
    },
    signature: leg.signature as Hex,
  });
}

beforeEach(() => {
  localStorage.clear();
  importPrivateKey(KEY);
});

describe('signWithdrawal', () => {
  it('signWithdrawalNeverReturnsTheKey', async () => {
    const before = localStorage.getItem('legwork.payoutKey.v1');
    const signed = await signWithdrawal(DESTINATION, 3_000_000n, USDC_CHAIN_ID, USDC_ADDRESS);

    // Serialised whole — every field, both legs, the signatures included. The key is not in
    // it, in either case, and neither is the key without its `0x`.
    const wire = JSON.stringify(signed);
    expect(wire).not.toContain(KEY);
    expect(wire).not.toContain(KEY.slice(2));
    expect(wire.toLowerCase()).not.toContain(KEY.toLowerCase());

    // And nothing about signing changed what is stored: the key went in, and it is still the
    // only copy, unmoved.
    expect(localStorage.getItem('legwork.payoutKey.v1')).toBe(before);
    expect(localStorage.getItem('legwork.payoutKey.v1')).toBe(KEY);
    expect(localStorage.length).toBe(1);

    // What did come back is two real signatures over the worker's own address.
    expect(await signerOf(signed.payout)).toBe(WORKER);
    expect(await signerOf(signed.fee)).toBe(WORKER);
  });

  it('signWithdrawalBuildsBothLegsLocally', async () => {
    const signed = await signWithdrawal(DESTINATION, 3_000_000n, USDC_CHAIN_ID, USDC_ADDRESS);

    // The payout leg names the caller's destination; the fee leg names the treasury. Neither
    // address came off a wire — one is the argument, one is the module constant.
    expect(signed.payout.to).toBe(DESTINATION);
    expect(signed.fee.to).toBe(TREASURY_ADDRESS);
    expect(signed.to).toBe(DESTINATION);

    // 3.00 splits 2.94 / 0.06, and the two legs add back up to exactly what went in.
    expect(signed.payout.value).toBe('2940000');
    expect(signed.fee.value).toBe('60000');
    expect(BigInt(signed.payout.value) + BigInt(signed.fee.value)).toBe(3_000_000n);
    expect(BigInt(signed.fee.value)).toBe(withdrawFeeOn(3_000_000n));

    // The signatures cover those recipients, so a relayer cannot change one in flight either.
    expect(await signerOf(signed.payout)).toBe(WORKER);
    expect(await signerOf(signed.fee)).toBe(WORKER);

    // `validAfter = 0`, `validBefore = now + 3600`, and a fresh 32-byte nonce per leg.
    expect(signed.payout.valid_after).toBe('0');
    const validBefore = Number(signed.payout.valid_before);
    expect(validBefore).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(validBefore).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);
    expect(signed.payout.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(signed.fee.nonce).not.toBe(signed.payout.nonce);

    // --- and now the attack the whole design is against ---

    // A server-shaped object where a destination should be. It is not an address, so nothing
    // is signed at all: the function refuses rather than reading a `to` out of it.
    const serverSaid = { to: ATTACKER, treasury: ATTACKER, value: '3000000' };
    await expect(
      signWithdrawal(serverSaid as unknown as string, 3_000_000n, USDC_CHAIN_ID, USDC_ADDRESS),
    ).rejects.toThrow(/destination/i);

    // The same object stringified is not an address either, and is refused the same way.
    await expect(
      signWithdrawal(JSON.stringify(serverSaid), 3_000_000n, USDC_CHAIN_ID, USDC_ADDRESS),
    ).rejects.toThrow(/destination/i);

    // And the fee leg is beyond reach in the first place: `TREASURY_ADDRESS` is not a
    // parameter, so even a call that got everything else it wanted cannot move it. Passing
    // the attacker as the *destination* moves the payout leg — that is the worker's own
    // choice to make — and leaves the fee leg exactly where it was.
    const toAttacker = await signWithdrawal(ATTACKER, 3_000_000n, USDC_CHAIN_ID, USDC_ADDRESS);
    expect(toAttacker.payout.to).toBe(ATTACKER);
    expect(toAttacker.fee.to).toBe(TREASURY_ADDRESS);
    expect(TREASURY_ADDRESS).not.toBe(ATTACKER);

    // A token contract the caller made up is refused too, so a swapped domain cannot make a
    // signature that means something else on a different chain.
    await expect(
      signWithdrawal(DESTINATION, 3_000_000n, USDC_CHAIN_ID, 'not-an-address'),
    ).rejects.toThrow(/token contract/i);
  });
});
