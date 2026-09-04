import type { Abi } from 'viem';
// The four frozen ABIs, by path rather than through `@legwork/shared`'s entry point: the
// package exports `.` only, and these are data files, not TypeScript. T-01a owns them; this
// package reads them and never restates a name they contain.
import abuseMarkAbiJson from '../../shared/src/abi/IAbuseMark.json' with { type: 'json' };
import reputationAbiJson from '../../shared/src/abi/IReputation.json' with { type: 'json' };
import taskEscrowAbiJson from '../../shared/src/abi/ITaskEscrow.json' with { type: 'json' };
import workerRegistryAbiJson from '../../shared/src/abi/IWorkerRegistry.json' with { type: 'json' };

export const workerRegistryAbi = workerRegistryAbiJson as Abi;
export const taskEscrowAbi = taskEscrowAbiJson as Abi;
export const reputationAbi = reputationAbiJson as Abi;
export const abuseMarkAbi = abuseMarkAbiJson as Abi;

/**
 * `paused()` comes from OpenZeppelin's `Pausable`, not from `ITaskEscrow`, so the frozen ABI
 * does not carry it. One fragment rather than a second ABI file.
 */
export const pausableAbi = [
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const satisfies Abi;

/**
 * The ERC-8004 IdentityRegistry, as far as this package is concerned: the two reads that
 * answer "does this agent id belong to the wallet that paid?". Generated from
 * `contracts/src/interfaces/IERC8004.sol` because T-04 has not published an ABI file yet;
 * when it does, this is deleted and the file is imported like the four above.
 *
 * `register` is not here on purpose — the Task API never registers an identity itself;
 * `AbuseMark.registerIdentity` does, from the owner key.
 */
export const erc8004IdentityAbi = [
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentWallet',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const satisfies Abi;

/**
 * The USDC slice this package uses: a balance read, and the approval pair the direct path
 * needs — `postAsBuyer` pulls from the buyer's own wallet, which cannot work until that
 * wallet has approved the escrow.
 */
export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi;

/** Every event this system can emit, in one list, for `decodeEvents`. */
export const allEventAbis: Abi = [
  ...taskEscrowAbi,
  ...workerRegistryAbi,
  ...reputationAbi,
  ...abuseMarkAbi,
];
