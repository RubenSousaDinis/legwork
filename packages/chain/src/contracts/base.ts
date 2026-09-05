import { encodeFunctionData, getContract, type Abi, type Address, type PublicClient, type TransactionReceipt } from 'viem';
import type { Role } from '../clients';
import type { DirectSender } from '../adapter';
import type { TxQueue } from '../tx-queue';

/** The queues a client may send through. A client that is read-only gets none. */
export type Queues = Partial<Record<Role, TxQueue>>;

export interface ContractClientOptions {
  address: Address;
  publicClient: PublicClient;
  queues?: Queues;
}

/**
 * Reads go straight out on the public client. Writes are encoded here and handed to the
 * queue for the role that is allowed to make them — which is what stops a route from
 * accidentally sending an owner-only call from the relayer key, or sending anything at all
 * outside the queue.
 */
export abstract class ContractClient {
  readonly address: Address;
  protected readonly publicClient: PublicClient;
  protected readonly queues: Queues;
  protected abstract readonly abi: Abi;

  constructor(options: ContractClientOptions) {
    this.address = options.address;
    this.publicClient = options.publicClient;
    this.queues = options.queues ?? {};
  }

  protected async read<T>(
    functionName: string,
    args: readonly unknown[] = [],
    abi: Abi = this.abi,
  ): Promise<T> {
    const contract = getContract({ address: this.address, abi, client: this.publicClient });
    const reads = contract.read as unknown as Record<
      string,
      (args: readonly unknown[]) => Promise<unknown>
    >;
    const fn = reads[functionName];
    if (!fn) throw new Error(`${functionName} is not a view on ${this.address}`);
    return (await fn(args)) as T;
  }

  protected queue(role: Role): TxQueue {
    const queue = this.queues[role];
    if (!queue) throw new Error(`no ${role} queue configured for ${this.address}`);
    return queue;
  }

  protected write(
    role: Role,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<TransactionReceipt> {
    return this.queue(role).sendAndWait({
      to: this.address,
      data: encodeFunctionData({ abi: this.abi, functionName, args }),
    });
  }

  /**
   * The direct path. Script-only: it signs with somebody else's wallet and never touches a
   * Legwork key, so it deliberately does not go through a queue — there is no shared nonce
   * to serialize.
   */
  protected async writeAs(
    sender: DirectSender,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<TransactionReceipt> {
    const walletClient = sender.walletClient;
    if (!walletClient?.account) {
      throw new Error(`${functionName}: the direct path needs a walletClient with an account`);
    }
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: walletClient.chain ?? null,
      to: this.address,
      data: encodeFunctionData({ abi: this.abi, functionName, args }),
    });
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
