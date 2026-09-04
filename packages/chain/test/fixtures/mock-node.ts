import {
  custom,
  keccak256,
  numberToHex,
  parseTransaction,
  type Hex,
  type Transport,
  type TransactionSerializable,
} from 'viem';

/**
 * A programmable JSON-RPC endpoint that never opens a socket.
 *
 * `TxQueue` is the one component that has to be tested against a *node*, not against a
 * contract: nonces, fee bumps and the resync path are all node behaviour. A viem
 * `custom()` transport gives us the node without the network, and decoding the raw
 * transaction the queue signed is the only honest way to assert which nonce it actually used.
 */
export class MockNode {
  /** Every raw transaction the queue sent, decoded, in send order. */
  readonly sends: TransactionSerializable[] = [];
  /** How many times each RPC method was called. */
  readonly calls: Record<string, number> = {};

  /** `eth_getTransactionCount` answers these in order; the last one repeats. */
  transactionCounts: number[] = [0];
  /** `eth_sendRawTransaction` rejects with these in order; `null` means "accept". */
  sendFailures: (Error | null)[] = [];
  /** How long `eth_getTransactionReceipt` takes to answer. */
  receiptDelayMs = 0;

  readonly chainId: number;

  constructor(options: { chainId?: number } = {}) {
    this.chainId = options.chainId ?? 31337;
  }

  private count(method: string): number {
    const n = (this.calls[method] ?? 0) + 1;
    this.calls[method] = n;
    return n;
  }

  private nextTransactionCount(): number {
    const index = Math.min(this.calls['eth_getTransactionCount'] ?? 1, this.transactionCounts.length) - 1;
    return this.transactionCounts[index] ?? 0;
  }

  /** Nonces the queue actually put on the wire, in order. */
  noncesSent(): number[] {
    return this.sends.map((tx) => tx.nonce ?? -1);
  }

  transport(): Transport {
    return custom({
      request: async ({ method, params }): Promise<unknown> => {
        const seq = this.count(method);
        switch (method) {
          case 'eth_chainId':
            return numberToHex(this.chainId);

          case 'eth_getTransactionCount':
            return numberToHex(this.nextTransactionCount());

          case 'eth_estimateGas':
            return numberToHex(21_000);

          case 'eth_gasPrice':
            return numberToHex(1_000_000_000);

          case 'eth_maxPriorityFeePerGas':
            return numberToHex(1_000_000_000);

          case 'eth_feeHistory':
            return {
              oldestBlock: numberToHex(1),
              baseFeePerGas: [numberToHex(1_000_000_000), numberToHex(1_000_000_000)],
              gasUsedRatio: [0.5],
              reward: [[numberToHex(1_000_000_000)]],
            };

          case 'eth_blockNumber':
            return numberToHex(1);

          case 'eth_getBlockByNumber':
          case 'eth_getBlockByHash':
            return this.block();

          case 'eth_sendRawTransaction': {
            const failure = this.sendFailures[seq - 1];
            const raw = (params as [Hex])[0];
            if (failure) throw failure;
            this.sends.push(parseTransaction(raw));
            return keccak256(raw);
          }

          case 'eth_getTransactionReceipt': {
            if (this.receiptDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, this.receiptDelayMs));
            }
            return this.receipt((params as [Hex])[0]);
          }

          case 'eth_getTransactionByHash':
            return null;

          default:
            // JSON-RPC "method not found", not a bare Error: viem retries an unrecognised
            // failure three times with a delay, and a probe like `eth_fillTransaction`
            // would then cost a second per call.
            throw Object.assign(new Error(`MockNode: unsupported RPC method ${method}`), {
              code: -32601,
            });
        }
      },
    });
  }

  private block(): Record<string, unknown> {
    return {
      number: numberToHex(1),
      hash: keccak256(numberToHex(1)),
      parentHash: keccak256(numberToHex(0)),
      timestamp: numberToHex(1_760_000_000),
      baseFeePerGas: numberToHex(1_000_000_000),
      gasLimit: numberToHex(30_000_000),
      gasUsed: numberToHex(21_000),
      miner: '0x0000000000000000000000000000000000000000',
      difficulty: numberToHex(0),
      extraData: '0x',
      logsBloom: `0x${'0'.repeat(512)}`,
      nonce: '0x0000000000000000',
      size: numberToHex(1),
      transactions: [],
      uncles: [],
      sha3Uncles: keccak256('0x'),
      stateRoot: keccak256('0x'),
      transactionsRoot: keccak256('0x'),
      receiptsRoot: keccak256('0x'),
      mixHash: keccak256('0x'),
      totalDifficulty: numberToHex(0),
    };
  }

  private receipt(hash: Hex): Record<string, unknown> {
    return {
      blockHash: keccak256(numberToHex(1)),
      blockNumber: numberToHex(1),
      contractAddress: null,
      cumulativeGasUsed: numberToHex(21_000),
      effectiveGasPrice: numberToHex(1_000_000_000),
      from: '0x0000000000000000000000000000000000000000',
      gasUsed: numberToHex(21_000),
      logs: [],
      logsBloom: `0x${'0'.repeat(512)}`,
      status: '0x1',
      to: '0x0000000000000000000000000000000000000000',
      transactionHash: hash,
      transactionIndex: numberToHex(0),
      type: '0x2',
    };
  }
}
