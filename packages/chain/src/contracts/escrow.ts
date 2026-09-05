import type { Address, Hex, TransactionReceipt } from 'viem';
import { pausableAbi, taskEscrowAbi } from '../abi';
import type { DirectSender, PostParams, Task } from '../adapter';
import { ContractClient } from './base';

/** `ITaskEscrow`. Method names are the Solidity ones; the role each write needs is the contract's. */
export class EscrowClient extends ContractClient {
  protected readonly abi = taskEscrowAbi;

  // --- views ---
  getTask(taskId: bigint): Promise<Task> {
    return this.read('getTask', [taskId]);
  }
  taskCount(): Promise<bigint> {
    return this.read('taskCount');
  }
  openTasksOf(buyer: Address): Promise<bigint> {
    return this.read('openTasksOf', [buyer]);
  }
  activeClaimOf(worker: Address): Promise<bigint> {
    return this.read('activeClaimOf', [worker]);
  }
  cooldownUntil(worker: Address): Promise<bigint> {
    return this.read('cooldownUntil', [worker]);
  }
  allowlistedBuyer(buyer: Address): Promise<boolean> {
    return this.read('allowlistedBuyer', [buyer]);
  }
  /** From OpenZeppelin's `Pausable`, so it needs the fragment rather than the frozen ABI. */
  paused(): Promise<boolean> {
    return this.read('paused', [], pausableAbi);
  }
  maxOpenTasksPerBuyer(): Promise<bigint> {
    return this.read('maxOpenTasksPerBuyer');
  }
  FEE_BPS(): Promise<number> {
    return this.read('FEE_BPS');
  }
  MAX_TASK_AMOUNT(): Promise<bigint> {
    return this.read('MAX_TASK_AMOUNT');
  }
  CLAIM_COOLDOWN(): Promise<number> {
    return this.read('CLAIM_COOLDOWN');
  }
  usdc(): Promise<Address> {
    return this.read('usdc');
  }
  treasury(): Promise<Address> {
    return this.read('treasury');
  }
  relayer(): Promise<Address> {
    return this.read('relayer');
  }
  registry(): Promise<Address> {
    return this.read('registry');
  }
  reputation(): Promise<Address> {
    return this.read('reputation');
  }
  abuseMark(): Promise<Address> {
    return this.read('abuseMark');
  }

  // --- relayer role ---
  post(p: PostParams): Promise<TransactionReceipt> {
    return this.write('relayer', 'post', [p]);
  }
  claimFor(taskId: bigint, worker: Address): Promise<TransactionReceipt> {
    return this.write('relayer', 'claimFor', [taskId, worker]);
  }
  releaseClaimFor(taskId: bigint, worker: Address): Promise<TransactionReceipt> {
    return this.write('relayer', 'releaseClaimFor', [taskId, worker]);
  }
  submitFor(taskId: bigint, worker: Address, proofHash: Hex): Promise<TransactionReceipt> {
    return this.write('relayer', 'submitFor', [taskId, worker, proofHash]);
  }
  approve(taskId: bigint): Promise<TransactionReceipt> {
    return this.write('relayer', 'approve', [taskId]);
  }
  dispute(taskId: bigint): Promise<TransactionReceipt> {
    return this.write('relayer', 'dispute', [taskId]);
  }
  /** Anyone may call this one; the relayer is simply who we have. */
  autoRelease(taskId: bigint): Promise<TransactionReceipt> {
    return this.write('relayer', 'autoRelease', [taskId]);
  }
  expire(taskId: bigint): Promise<TransactionReceipt> {
    return this.write('relayer', 'expire', [taskId]);
  }

  // --- owner role: the disclosed operator powers ---
  pause(): Promise<TransactionReceipt> {
    return this.write('owner', 'pause');
  }
  unpause(): Promise<TransactionReceipt> {
    return this.write('owner', 'unpause');
  }
  resolve(taskId: bigint, toBuyer: boolean): Promise<TransactionReceipt> {
    return this.write('owner', 'resolve', [taskId, toBuyer]);
  }
  setAllowlistedBuyer(buyer: Address, allowed: boolean): Promise<TransactionReceipt> {
    return this.write('owner', 'setAllowlistedBuyer', [buyer, allowed]);
  }

  // --- direct path: script-only, signed by the caller's own wallet ---
  postAsBuyer(p: PostParams, sender: DirectSender): Promise<TransactionReceipt> {
    return this.writeAs(sender, 'postAsBuyer', [p]);
  }
  claim(taskId: bigint, sender: DirectSender): Promise<TransactionReceipt> {
    return this.writeAs(sender, 'claim', [taskId]);
  }
  releaseClaim(taskId: bigint, sender: DirectSender): Promise<TransactionReceipt> {
    return this.writeAs(sender, 'releaseClaim', [taskId]);
  }
  submit(taskId: bigint, proofHash: Hex, sender: DirectSender): Promise<TransactionReceipt> {
    return this.writeAs(sender, 'submit', [taskId, proofHash]);
  }
}
