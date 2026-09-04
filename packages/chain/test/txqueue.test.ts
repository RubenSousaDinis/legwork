import { describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, stringToHex, type PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import pino, { type Logger } from 'pino';
import { MemoryNonceLock } from '../src/nonce-lock.js';
import { TxQueue } from '../src/tx-queue.js';
import { MockNode } from './fixtures/mock-node.js';

const TO = '0x00000000000000000000000000000000000000f0' as const;
const DATA = stringToHex('legwork');

/** A pino logger writing parsed records into an array — the real logger, no stub. */
function recordingLogger(): { logger: Logger; records: Record<string, unknown>[] } {
  const records: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'debug' },
    {
      write(line: string) {
        records.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { logger, records };
}

function harness(node: MockNode) {
  const transport = node.transport();
  const account = privateKeyToAccount(generatePrivateKey());
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 5 });
  const walletClient = createWalletClient({ account, chain: foundry, transport });
  const { logger, records } = recordingLogger();
  const queue = new TxQueue({
    role: 'relayer',
    walletClient,
    publicClient: publicClient as PublicClient,
    lock: new MemoryNonceLock(),
    logger,
  });
  return { queue, records };
}

describe('TxQueue', () => {
  it('serializes 20 concurrent sends with strictly increasing nonces', async () => {
    const node = new MockNode();
    node.transactionCounts = [0];
    const { queue } = harness(node);

    await Promise.all(
      Array.from({ length: 20 }, () => queue.send({ to: TO, data: DATA })),
    );

    expect(node.noncesSent()).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(node.calls['eth_getTransactionCount']).toBe(1);
  });

  it('resyncs from the pending nonce after a nonce error and retries', async () => {
    const node = new MockNode();
    // 5 on the first read, 7 on the resync: proves the second nonce came from the node and
    // not from the stored one.
    node.transactionCounts = [5, 7];
    node.sendFailures = [new Error('nonce too low')];
    const { queue } = harness(node);

    await queue.send({ to: TO, data: DATA });

    expect(node.calls['eth_sendRawTransaction']).toBe(2);
    expect(node.sends).toHaveLength(1);
    expect(node.sends[0]?.nonce).toBe(7);

    const attemptOneMaxFee = 1_000_000_000n * 12n / 10n + 1_000_000_000n;
    expect(node.sends[0]?.maxFeePerGas ?? 0n).toBeGreaterThanOrEqual(
      (attemptOneMaxFee * 115n) / 100n,
    );
  });

  it('gives up after maxAttempts and surfaces the last error', async () => {
    const node = new MockNode();
    node.transactionCounts = [0];
    node.sendFailures = [
      new Error('nonce too low'),
      new Error('nonce has already been used'),
      new Error('replacement transaction underpriced'),
    ];
    const { queue, records } = harness(node);

    await expect(queue.send({ to: TO, data: DATA })).rejects.toThrow(
      'replacement transaction underpriced',
    );

    const attempts = records.filter((r) => r['err'] !== undefined).map((r) => r['attempt']);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('releases the lock before waiting for the receipt', async () => {
    const node = new MockNode();
    node.transactionCounts = [0];
    node.receiptDelayMs = 200;
    const { queue } = harness(node);

    const started = Date.now();
    await Promise.all([
      queue.sendAndWait({ to: TO, data: DATA }),
      queue.sendAndWait({ to: TO, data: DATA }),
    ]);
    const elapsed = Date.now() - started;

    // Two 200 ms receipts in parallel, not in series: anything at or over 300 ms means the
    // lock was held across the wait.
    expect(elapsed).toBeLessThan(300);
    expect(node.noncesSent()).toEqual([0, 1]);
  });
});
