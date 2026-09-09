import { getAddress, isAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { withdrawFeeOn } from '@legwork/shared';

/**
 * The worker's payout key. It is generated on the phone, stored in `localStorage`, and never
 * sent anywhere: not to the API, not to a log, not into React state for longer than the
 * reveal box is open. Legwork only ever learns the address, which is what `POST /register`
 * writes onchain.
 */

const STORAGE_KEY = 'legwork.payoutKey.v1';

/** viem generates lowercase; an imported key has to match byte for byte. */
export const PRIVATE_KEY_RE = /^0x[0-9a-f]{64}$/;

export type PayoutKey = { address: `0x${string}` };

function store(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('the payout key exists only in the browser');
  }
  return window.localStorage;
}

function readKey(): `0x${string}` | null {
  const raw = store().getItem(STORAGE_KEY);
  return raw !== null && PRIVATE_KEY_RE.test(raw) ? (raw as `0x${string}`) : null;
}

/** First call generates and stores; every later call returns the same address. */
export function loadOrCreatePayoutKey(): PayoutKey {
  let key = readKey();
  if (key === null) {
    key = generatePrivateKey();
    store().setItem(STORAGE_KEY, key);
  }
  return { address: privateKeyToAccount(key).address };
}

/** The address only — safe to render, to log and to send. `null` before the first key. */
export function getPayoutAddress(): `0x${string}` | null {
  const key = readKey();
  return key === null ? null : privateKeyToAccount(key).address;
}

/** Behind two taps in the UI: reveal, then copy. The caller never keeps the result. */
export function exportPrivateKey(): string | null {
  return readKey();
}

/** Restores an account on a new phone, or after site data was cleared. */
export function importPrivateKey(hex: string): PayoutKey {
  const candidate = hex.trim();
  if (!PRIVATE_KEY_RE.test(candidate)) {
    throw new Error('A payout key is 0x followed by 64 lowercase hex characters.');
  }
  store().setItem(STORAGE_KEY, candidate);
  return { address: privateKeyToAccount(candidate as `0x${string}`).address };
}

// --------------------------------------------------- withdrawing, gaslessly

/**
 * Everything the withdrawal signs against, held here rather than fetched.
 *
 * This is the security property of the whole feature, so it is a constant and not an
 * argument and not a response field. A server that could name the token contract, the chain
 * or the fee recipient could name itself, hand back a payload whose `to` is an address it
 * controls, and the phone would sign away the worker's balance without a single thing on the
 * screen looking wrong. Nothing below is ever read from an API response.
 */
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
export const USDC_CHAIN_ID = 84532;
export const USDC_DOMAIN_NAME = 'USDC';
export const USDC_DOMAIN_VERSION = '2';

/** Legwork's fee address, from `contracts/deployments/base-sepolia.json`. */
export const TREASURY_ADDRESS = '0xABFDB572E3d6093113Cdb9c1C1599E8699226D52' as const;

/** An authorization is good for an hour: long enough for a relayer round trip, short enough to expire. */
export const AUTHORIZATION_TTL_S = 3600;

/** EIP-3009, field for field. `bytes32 nonce` is the replay key both legs are recorded under. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/**
 * One signed leg, as it travels to the API. The numbers are decimal strings because JSON has
 * no bigint and a `uint256` will not survive a `number`.
 */
export type SignedAuthorization = {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  valid_after: string;
  valid_before: string;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

/** What `POST /me/withdraw` is given: the destination the worker typed, and the two legs. */
export type SignedWithdrawal = {
  to: `0x${string}`;
  payout: SignedAuthorization;
  fee: SignedAuthorization;
};

/** 32 random bytes from the platform CSPRNG. One per leg, so the two legs replay separately. */
function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Signs the two `TransferWithAuthorization` payloads a gasless withdrawal is made of.
 *
 * **The payloads are built here, from the caller's own arguments and the constants above.**
 * The API is handed the result; it is never asked what to sign. `to` is the address the
 * worker typed on their phone and the only recipient they get to choose; the fee leg's
 * recipient is `TREASURY_ADDRESS` and is not a parameter, so there is no argument, no server
 * response and no object shape that can move it. That is the difference between Legwork
 * relaying a withdrawal and Legwork being able to take one.
 *
 * The key is read inside this function, used, and dropped. It is not returned, not logged,
 * not put into React state and not sent anywhere: the caller receives two signatures and the
 * fields they cover, which is everything the relayer needs and nothing it could steal with.
 */
export async function signWithdrawal(
  to: string,
  amountUnits: bigint,
  chainId: number,
  usdc: string,
): Promise<SignedWithdrawal> {
  if (typeof to !== 'string' || !isAddress(to)) {
    throw new Error('A destination is 0x followed by 40 hex characters.');
  }
  if (typeof usdc !== 'string' || !isAddress(usdc)) {
    throw new Error('The token contract is 0x followed by 40 hex characters.');
  }
  if (amountUnits <= 0n) throw new Error('Enter an amount to withdraw.');

  const fee = withdrawFeeOn(amountUnits);
  const payout = amountUnits - fee;

  const key = readKey();
  if (key === null) throw new Error('There is no payout key on this phone.');
  const account = privateKeyToAccount(key);

  const domain = {
    name: USDC_DOMAIN_NAME,
    version: USDC_DOMAIN_VERSION,
    chainId,
    verifyingContract: getAddress(usdc),
  } as const;

  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_S);

  const sign = async (recipient: `0x${string}`, value: bigint): Promise<SignedAuthorization> => {
    const nonce = randomNonce();
    const message = { from: account.address, to: recipient, value, validAfter, validBefore, nonce };
    const signature = await account.signTypedData({
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
    });
    return {
      from: account.address,
      to: recipient,
      value: value.toString(),
      valid_after: validAfter.toString(),
      valid_before: validBefore.toString(),
      nonce,
      signature,
    };
  };

  // Payout first in the returned object as well as on the wire: the route submits them in
  // this order, and a reader should not have to check which leg is which.
  return {
    to: getAddress(to),
    payout: await sign(getAddress(to), payout),
    fee: await sign(TREASURY_ADDRESS, fee),
  };
}
