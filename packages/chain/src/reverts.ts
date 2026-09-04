import { toFunctionSelector, type Abi, type Hex } from 'viem';
import { abuseMarkAbi, reputationAbi, taskEscrowAbi, workerRegistryAbi } from './abi.js';
import { ChainRevert } from './adapter.js';

/**
 * `error Foo(address)` → `0x…` selector, the same keccak-of-signature scheme functions use.
 */
function selectorsOf(abi: Abi): [Hex, string][] {
  return abi
    .filter((item): item is Extract<Abi[number], { type: 'error' }> => item.type === 'error')
    .map((item) => [
      toFunctionSelector(`${item.name}(${item.inputs.map((i) => i.type).join(',')})`),
      item.name,
    ]);
}

/**
 * The revert selectors this system can produce. The four frozen ABIs declare their own; the
 * OpenZeppelin ones are not in any of them because `Pausable` and `Ownable` are inherited,
 * not implemented.
 */
const ERROR_NAMES = new Map<string, string>([
  ...selectorsOf(taskEscrowAbi),
  ...selectorsOf(workerRegistryAbi),
  ...selectorsOf(reputationAbi),
  ...selectorsOf(abuseMarkAbi),
  [toFunctionSelector('EnforcedPause()'), 'EnforcedPause'],
  [toFunctionSelector('ExpectedPause()'), 'ExpectedPause'],
  [toFunctionSelector('OwnableUnauthorizedAccount(address)'), 'OwnableUnauthorizedAccount'],
  [toFunctionSelector('ERC20InsufficientBalance(address,uint256,uint256)'), 'ERC20InsufficientBalance'],
  [toFunctionSelector('ERC20InsufficientAllowance(address,uint256,uint256)'), 'ERC20InsufficientAllowance'],
]);

/** Digs the revert payload out of however deep the client wrapped it. */
function revertData(err: unknown): Hex | undefined {
  let cursor: unknown = err;
  for (let depth = 0; cursor && depth < 8; depth++) {
    const e = cursor as { data?: unknown; cause?: unknown };
    if (typeof e.data === 'string' && e.data.startsWith('0x')) return e.data as Hex;
    if (e.data && typeof e.data === 'object') {
      const inner = (e.data as { data?: unknown }).data;
      if (typeof inner === 'string' && inner.startsWith('0x')) return inner as Hex;
    }
    cursor = e.cause;
  }
  return undefined;
}

/**
 * Turns a node's revert into the same `ChainRevert` a `FakeChain` throws.
 *
 * Without this the two adapters would disagree about the one thing routes read: a 409 that
 * says `InCooldown` in a test and something shaped like a viem error in production is not
 * the same adapter. Returns `undefined` when the failure was not a revert we know — a
 * connection error stays a connection error.
 */
export function chainRevertFrom(err: unknown): ChainRevert | undefined {
  const data = revertData(err);
  if (!data || data.length < 10) return undefined;
  const name = ERROR_NAMES.get(data.slice(0, 10).toLowerCase() as Hex);
  return name ? new ChainRevert(name) : undefined;
}

/** Rethrows as a `ChainRevert` when the failure was a known revert, untouched otherwise. */
export function rethrowAsChainRevert(err: unknown): never {
  const revert = chainRevertFrom(err);
  if (revert) throw revert;
  throw err;
}
