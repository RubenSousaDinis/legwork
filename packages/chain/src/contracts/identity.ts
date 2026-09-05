import type { Address } from 'viem';
import { erc8004IdentityAbi } from '../abi';
import { ContractClient } from './base';

/**
 * The ERC-8004 IdentityRegistry, read-only.
 *
 * There is no reverse lookup from an address to an agent id, which is exactly why the API
 * verifies a *claimed* `agent_id` against these two reads instead of trusting the request.
 * What that verification decides is T-16's and T-30's business, not this package's.
 */
export class IdentityClient extends ContractClient {
  protected readonly abi = erc8004IdentityAbi;

  ownerOf(agentId: bigint): Promise<Address> {
    return this.read('ownerOf', [agentId]);
  }
  getAgentWallet(agentId: bigint): Promise<Address> {
    return this.read('getAgentWallet', [agentId]);
  }
}
