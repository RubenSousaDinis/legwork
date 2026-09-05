import type { Address, TransactionReceipt } from 'viem';
import { erc20Abi } from '../abi';
import type { DirectSender } from '../adapter';
import type { Role } from '../clients';
import { ContractClient } from './base';

/**
 * The USDC slice this package needs. Testnet USDC, six decimals, not spendable anywhere.
 */
export class UsdcClient extends ContractClient {
  protected readonly abi = erc20Abi;

  balanceOf(account: Address): Promise<bigint> {
    return this.read('balanceOf', [account]);
  }
  allowance(owner: Address, spender: Address): Promise<bigint> {
    return this.read('allowance', [owner, spender]);
  }

  /** The relayer approving the escrow, so `post` can pull the float. */
  approve(spender: Address, value: bigint, role: Role = 'relayer'): Promise<TransactionReceipt> {
    return this.write(role, 'approve', [spender, value]);
  }

  /** The buyer approving the escrow before `postAsBuyer`. Script-only, like the direct path. */
  approveAs(sender: DirectSender, spender: Address, value: bigint): Promise<TransactionReceipt> {
    return this.writeAs(sender, 'approve', [spender, value]);
  }
}
