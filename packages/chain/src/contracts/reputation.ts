import type { Address, Hex, TransactionReceipt } from 'viem';
import { reputationAbi } from '../abi.js';
import { ContractClient } from './base.js';

/**
 * `IReputation`, keyed by nullifier so a worker rotating their payout address keeps their
 * record. `feedback` is `onlyEscrow` and therefore has no client method: nothing off-chain
 * is allowed to call it.
 */
export class ReputationClient extends ContractClient {
  protected readonly abi = reputationAbi;

  score(nullifierHash: bigint): Promise<bigint> {
    return this.read('score', [nullifierHash]);
  }
  completed(nullifierHash: bigint): Promise<bigint> {
    return this.read('completed', [nullifierHash]);
  }
  distinctRaters(nullifierHash: bigint): Promise<bigint> {
    return this.read('distinctRaters', [nullifierHash]);
  }
  slotOf(nullifierHash: bigint, raterKey: Hex): Promise<number> {
    return this.read('slotOf', [nullifierHash, raterKey]);
  }
  escrow(): Promise<Address> {
    return this.read('escrow');
  }

  setEscrow(escrow: Address): Promise<TransactionReceipt> {
    return this.write('owner', 'setEscrow', [escrow]);
  }
}
