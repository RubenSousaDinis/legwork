import type { Address, Hex, TransactionReceipt } from 'viem';
import { abuseMarkAbi } from '../abi';
import { ContractClient } from './base';

/**
 * `IAbuseMark`. `mark` is the only call the signer key may make, and `outcome` is
 * `onlyEscrow`, so neither the API nor a script can write agent feedback by hand.
 */
export class AbuseMarkClient extends ContractClient {
  protected readonly abi = abuseMarkAbi;

  marked(agentId: bigint, specHash: Hex): Promise<boolean> {
    return this.read('marked', [agentId, specHash]);
  }
  lastMarkAt(agentId: bigint): Promise<bigint> {
    return this.read('lastMarkAt', [agentId]);
  }
  marksOf(agentId: bigint): Promise<bigint> {
    return this.read('marksOf', [agentId]);
  }
  markCooldown(): Promise<bigint> {
    return this.read('markCooldown');
  }
  selfAgentId(): Promise<bigint> {
    return this.read('selfAgentId');
  }
  signer(): Promise<Address> {
    return this.read('signer');
  }
  escrow(): Promise<Address> {
    return this.read('escrow');
  }

  mark(agentId: bigint, classId: number, specHash: Hex): Promise<TransactionReceipt> {
    return this.write('signer', 'mark', [agentId, classId, specHash]);
  }

  registerIdentity(agentURI: string): Promise<TransactionReceipt> {
    return this.write('owner', 'registerIdentity', [agentURI]);
  }
  setMarkCooldown(seconds: bigint): Promise<TransactionReceipt> {
    return this.write('owner', 'setMarkCooldown', [seconds]);
  }
  setSigner(signer: Address): Promise<TransactionReceipt> {
    return this.write('owner', 'setSigner', [signer]);
  }
  setEscrow(escrow: Address): Promise<TransactionReceipt> {
    return this.write('owner', 'setEscrow', [escrow]);
  }
}
