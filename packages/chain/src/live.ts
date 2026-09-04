import type { Address, Hex, TransactionReceipt } from 'viem';
import type { Logger } from 'pino';
import type {
  ChainAdapter,
  DirectSender,
  PostParams,
  Task,
  TxResult,
} from './adapter.js';
import { createClients, type Clients, type Role } from './clients.js';
import {
  AbuseMarkClient,
  EscrowClient,
  IdentityClient,
  RegistryClient,
  ReputationClient,
  UsdcClient,
} from './contracts/index.js';
import type { ChainEnv } from './env.js';
import { decodeEvents, taskIdFromReceipt } from './events.js';
import type { NonceLock } from './nonce-lock.js';
import { rethrowAsChainRevert } from './reverts.js';
import { TxQueue } from './tx-queue.js';

export interface LiveChainOptions {
  env: ChainEnv;
  /** `PgNonceLock` in the API, `MemoryNonceLock` in a single-process script. */
  lock: NonceLock;
  /** Built from `env` when absent. */
  clients?: Clients;
  logger?: Logger;
  maxAttempts?: number;
  gasBumpPercent?: number;
}

/**
 * `ChainAdapter` over a real node.
 *
 * Three queues, because there are three keys: the relayer sends everything the API relays,
 * the signer sends `mark` and nothing else, and the owner — present only when a
 * `DEPLOYER_PRIVATE_KEY` was supplied, so never in the API — sends the disclosed operator
 * calls. The direct-path writes take a wallet of their own and go nowhere near any of them.
 */
export class LiveChain implements ChainAdapter {
  readonly registry: RegistryClient;
  readonly escrow: EscrowClient;
  readonly reputation: ReputationClient;
  readonly abuseMark: AbuseMarkClient;
  readonly usdc: UsdcClient;
  readonly identity: IdentityClient;
  readonly queues: { relayer: TxQueue; signer: TxQueue; owner?: TxQueue };

  private readonly clients: Clients;

  constructor(options: LiveChainOptions) {
    const { env, lock } = options;
    this.clients = options.clients ?? createClients(env);
    const { publicClient, wallets } = this.clients;

    const queue = (role: Role, walletClient: NonNullable<Clients['wallets']['owner']>) =>
      new TxQueue({
        role,
        walletClient,
        publicClient,
        lock,
        ...(options.logger ? { logger: options.logger } : {}),
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
        ...(options.gasBumpPercent === undefined ? {} : { gasBumpPercent: options.gasBumpPercent }),
      });

    this.queues = {
      relayer: queue('relayer', wallets.relayer),
      signer: queue('signer', wallets.signer),
      ...(wallets.owner ? { owner: queue('owner', wallets.owner) } : {}),
    };

    const queues = this.queues;
    this.registry = new RegistryClient({ address: env.WORKER_REGISTRY_ADDRESS, publicClient, queues });
    this.escrow = new EscrowClient({ address: env.TASK_ESCROW_ADDRESS, publicClient, queues });
    this.reputation = new ReputationClient({ address: env.REPUTATION_ADDRESS, publicClient, queues });
    this.abuseMark = new AbuseMarkClient({ address: env.ABUSEMARK_ADDRESS, publicClient, queues });
    this.usdc = new UsdcClient({ address: env.USDC_ADDRESS, publicClient, queues });
    this.identity = new IdentityClient({ address: env.ERC8004_IDENTITY_ADDRESS, publicClient });
  }

  // --- escrow reads ---
  getTask(taskId: bigint): Promise<Task> {
    return this.escrow.getTask(taskId);
  }
  taskCount(): Promise<bigint> {
    return this.escrow.taskCount();
  }
  openTasksOf(buyer: Address): Promise<bigint> {
    return this.escrow.openTasksOf(buyer);
  }
  activeClaimOf(worker: Address): Promise<bigint> {
    return this.escrow.activeClaimOf(worker);
  }
  cooldownUntil(worker: Address): Promise<bigint> {
    return this.escrow.cooldownUntil(worker);
  }
  allowlistedBuyer(buyer: Address): Promise<boolean> {
    return this.escrow.allowlistedBuyer(buyer);
  }
  paused(): Promise<boolean> {
    return this.escrow.paused();
  }

  // --- registry reads ---
  isWorker(a: Address): Promise<boolean> {
    return this.registry.isWorker(a);
  }
  isSeeded(a: Address): Promise<boolean> {
    return this.registry.isSeeded(a);
  }
  nullifierOf(a: Address): Promise<bigint> {
    return this.registry.nullifierOf(a);
  }
  workerOf(nullifierHash: bigint): Promise<Address> {
    return this.registry.workerOf(nullifierHash);
  }
  areaOf(a: Address): Promise<string> {
    return this.registry.areaOf(a);
  }
  taskTypesOf(a: Address): Promise<number> {
    return this.registry.taskTypesOf(a);
  }

  // --- reputation reads ---
  score(nullifierHash: bigint): Promise<bigint> {
    return this.reputation.score(nullifierHash);
  }
  completed(nullifierHash: bigint): Promise<bigint> {
    return this.reputation.completed(nullifierHash);
  }
  distinctRaters(nullifierHash: bigint): Promise<bigint> {
    return this.reputation.distinctRaters(nullifierHash);
  }
  slotOf(nullifierHash: bigint, raterKey: Hex): Promise<number> {
    return this.reputation.slotOf(nullifierHash, raterKey);
  }

  // --- abuse-mark reads ---
  marked(agentId: bigint, specHash: Hex): Promise<boolean> {
    return this.abuseMark.marked(agentId, specHash);
  }
  lastMarkAt(agentId: bigint): Promise<bigint> {
    return this.abuseMark.lastMarkAt(agentId);
  }
  markCooldown(): Promise<bigint> {
    return this.abuseMark.markCooldown();
  }
  selfAgentId(): Promise<bigint> {
    return this.abuseMark.selfAgentId();
  }

  // --- ERC-8004 identity reads ---
  ownerOf(agentId: bigint): Promise<Address> {
    return this.identity.ownerOf(agentId);
  }
  getAgentWallet(agentId: bigint): Promise<Address> {
    return this.identity.getAgentWallet(agentId);
  }

  // --- money and time ---
  usdcBalanceOf(a: Address): Promise<bigint> {
    return this.usdc.balanceOf(a);
  }
  async now(): Promise<bigint> {
    const block = await this.clients.publicClient.getBlock();
    return block.timestamp;
  }

  // --- relayer-role writes ---
  async post(p: PostParams): Promise<TxResult & { taskId: bigint }> {
    const receipt = await this.send(() => this.escrow.post(p));
    return { ...this.result(receipt), taskId: taskIdFromReceipt(receipt) };
  }
  async claimFor(taskId: bigint, worker: Address): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.claimFor(taskId, worker)));
  }
  async releaseClaimFor(taskId: bigint, worker: Address): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.releaseClaimFor(taskId, worker)));
  }
  async submitFor(taskId: bigint, worker: Address, proofHash: Hex): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.submitFor(taskId, worker, proofHash)));
  }
  async approve(taskId: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.approve(taskId)));
  }
  async dispute(taskId: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.dispute(taskId)));
  }
  async autoRelease(taskId: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.autoRelease(taskId)));
  }
  async expire(taskId: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.expire(taskId)));
  }
  async registerFor(
    nullifierHash: bigint,
    worker: Address,
    area: string,
    taskTypes: number,
    deadline: bigint,
    attestation: Hex,
  ): Promise<TxResult> {
    return this.result(
      await this.send(() =>
        this.registry.registerFor(nullifierHash, worker, area, taskTypes, deadline, attestation),
      ),
    );
  }

  // --- signer role ---
  async mark(
    agentId: bigint,
    classId: number,
    specHash: Hex,
  ): Promise<TxResult & { written: boolean }> {
    const receipt = await this.send(() => this.abuseMark.mark(agentId, classId, specHash));
    const result = this.result(receipt);
    // A repeat mark is a successful transaction that wrote nothing, so the presence of the
    // event is the only thing that distinguishes it from a first one.
    return { ...result, written: result.events.some((e) => e.name === 'Marked') };
  }

  // --- owner-role writes ---
  async pause(): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.pause()));
  }
  async unpause(): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.unpause()));
  }
  async resolve(taskId: bigint, toBuyer: boolean): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.resolve(taskId, toBuyer)));
  }
  async resetWorker(nullifierHash: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.registry.resetWorker(nullifierHash)));
  }
  async setAllowlistedBuyer(buyer: Address, allowed: boolean): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.setAllowlistedBuyer(buyer, allowed)));
  }
  async seedWorker(
    worker: Address,
    syntheticNullifier: bigint,
    area: string,
    taskTypes: number,
  ): Promise<TxResult> {
    return this.result(
      await this.send(() => this.registry.seedWorker(worker, syntheticNullifier, area, taskTypes)),
    );
  }
  async setMarkCooldown(seconds: bigint): Promise<TxResult> {
    return this.result(await this.send(() => this.abuseMark.setMarkCooldown(seconds)));
  }

  // --- direct path ---
  async postAsBuyer(p: PostParams, sender: DirectSender): Promise<TxResult & { taskId: bigint }> {
    const receipt = await this.send(() => this.escrow.postAsBuyer(p, sender));
    return { ...this.result(receipt), taskId: taskIdFromReceipt(receipt) };
  }
  async claim(taskId: bigint, sender: DirectSender): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.claim(taskId, sender)));
  }
  async submit(taskId: bigint, proofHash: Hex, sender: DirectSender): Promise<TxResult> {
    return this.result(await this.send(() => this.escrow.submit(taskId, proofHash, sender)));
  }

  private async send(call: () => Promise<TransactionReceipt>): Promise<TransactionReceipt> {
    try {
      return await call();
    } catch (err) {
      rethrowAsChainRevert(err);
    }
  }

  private result(receipt: TransactionReceipt): TxResult {
    return {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      events: decodeEvents(receipt.logs),
    };
  }
}
