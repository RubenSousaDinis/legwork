import { hexToBigInt, numberToHex } from 'viem';
import type { Account, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { Logger } from 'pino';
import type { Role } from './clients.js';
import type { NonceLock } from './nonce-lock.js';

export interface TxRequest {
  to: Address;
  data: Hex;
  value?: bigint;
}

export interface TxQueueOptions {
  role: Role;
  walletClient: WalletClient;
  publicClient: PublicClient;
  lock: NonceLock;
  logger?: Logger;
  maxAttempts?: number;
  gasBumpPercent?: number;
}

/**
 * The messages a node returns when our nonce is wrong. Matched as text, not as an error
 * class: every node implementation wraps these differently (anvil, Alchemy and a public Base
 * Sepolia endpoint each have their own envelope) and the string is the only stable part.
 */
const NONCE_ERROR_FRAGMENTS = [
  'nonce too low',
  'nonce has already been used',
  'already known',
  'replacement transaction underpriced',
] as const;

/** Walks `cause` so a viem `TransactionExecutionError` wrapping an RPC error still matches. */
function errorText(err: unknown): string {
  const parts: string[] = [];
  let cursor: unknown = err;
  for (let depth = 0; cursor && depth < 8; depth++) {
    const e = cursor as { message?: unknown; details?: unknown; shortMessage?: unknown; cause?: unknown };
    for (const field of [e.message, e.details, e.shortMessage]) {
      if (typeof field === 'string') parts.push(field);
    }
    if (parts.length === 0 && typeof cursor === 'string') parts.push(cursor);
    cursor = e.cause;
  }
  return parts.join(' | ');
}

export function isNonceError(err: unknown): boolean {
  const text = errorText(err).toLowerCase();
  return NONCE_ERROR_FRAGMENTS.some((fragment) => text.includes(fragment));
}

function bumpBy(value: bigint, percent: number, times: number): bigint {
  let out = value;
  for (let i = 0; i < times; i++) out = (out * BigInt(100 + percent)) / 100n;
  return out;
}

/**
 * The only writer of a Legwork key.
 *
 * Ten lines of algorithm:
 *   1. take the lock for this role
 *   2. nonce = the stored `next_nonce`, or `getTransactionCount(pending)` when nothing is stored
 *   3. estimate gas and fees
 *   4. sign
 *   5. `eth_sendRawTransaction`
 *   6. store `nonce + 1`
 *   7. release the lock — *before* waiting for any receipt
 *   8. on a nonce error: re-read `getTransactionCount(pending)`, overwrite the stored nonce,
 *      bump both fee caps by `gasBumpPercent`
 *   9. retry from 1, up to `maxAttempts`
 *  10. log `{ role, nonce, attempt, hash, err }` on every attempt — never the raw tx, never a key
 */
export class TxQueue {
  readonly role: Role;
  readonly address: Address;
  private readonly account: Account;
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly lock: NonceLock;
  private readonly logger: Logger | undefined;
  private readonly maxAttempts: number;
  private readonly gasBumpPercent: number;

  constructor(options: TxQueueOptions) {
    const account = options.walletClient.account;
    if (!account) throw new Error(`TxQueue(${options.role}): walletClient has no account`);
    this.role = options.role;
    this.account = account;
    this.address = account.address;
    this.walletClient = options.walletClient;
    this.publicClient = options.publicClient;
    this.lock = options.lock;
    this.logger = options.logger;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.gasBumpPercent = options.gasBumpPercent ?? 15;
  }

  async send(request: TxRequest): Promise<{ hash: Hex }> {
    // `resync` survives across attempts: once a node has told us our nonce is wrong, the
    // stored one is not to be trusted again until we have re-read the pending count.
    let resync = false;
    let bumps = 0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let nonce: bigint | undefined;
      try {
        const hash = await this.lock.withLock(this.role, async (store) => {
          let next = resync ? null : await store.get();
          if (next === null) {
            next = BigInt(
              await this.publicClient.getTransactionCount({
                address: this.address,
                blockTag: 'pending',
              }),
            );
            // Overwrite, never increment: the pending count *is* the truth after a resync.
            if (resync) await store.set(next);
          }
          nonce = next;

          const [gas, fees] = await Promise.all([this.estimateGas(request), this.publicClient.estimateFeesPerGas()]);

          const serializedTransaction = await this.walletClient.signTransaction({
            account: this.account,
            chain: this.walletClient.chain ?? null,
            to: request.to,
            data: request.data,
            ...(request.value === undefined ? {} : { value: request.value }),
            nonce: Number(next),
            gas,
            maxFeePerGas: bumpBy(fees.maxFeePerGas, this.gasBumpPercent, bumps),
            maxPriorityFeePerGas: bumpBy(fees.maxPriorityFeePerGas, this.gasBumpPercent, bumps),
            type: 'eip1559',
          });

          const sent = await this.publicClient.sendRawTransaction({ serializedTransaction });
          await store.set(next + 1n);
          return sent;
        });

        this.logger?.info({ role: this.role, nonce, attempt, hash }, 'tx sent');
        return { hash };
      } catch (err) {
        lastError = err;
        // `errorText`, not the error object: a viem error carries the serialized transaction
        // in `details`, and that is not something to put in a log line.
        this.logger?.warn(
          { role: this.role, nonce, attempt, err: errorText(err) },
          'tx attempt failed',
        );
        if (!isNonceError(err) || attempt === this.maxAttempts) throw err;
        resync = true;
        bumps = attempt;
      }
    }

    /* c8 ignore next -- the loop either returns or throws */
    throw lastError;
  }

  /**
   * `eth_estimateGas` as one raw call rather than viem's `estimateGas` action.
   *
   * The action prepares the request first, which costs an `eth_fillTransaction` probe every
   * real node rejects, a block fetch and a nonce fetch. Those round-trips would happen
   * *inside* the lock, where every concurrent invocation waits behind them.
   */
  private async estimateGas(request: TxRequest): Promise<bigint> {
    const gas = await this.publicClient.request({
      method: 'eth_estimateGas',
      params: [
        {
          from: this.address,
          to: request.to,
          data: request.data,
          ...(request.value === undefined ? {} : { value: numberToHex(request.value) }),
        },
      ],
    });
    return hexToBigInt(gas as Hex);
  }

  /**
   * Send, then wait outside the lock. The wait is the slow part and holding the lock through
   * it would serialize every invocation on one receipt.
   */
  async sendAndWait(request: TxRequest): Promise<TransactionReceipt> {
    const { hash } = await this.send(request);
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
