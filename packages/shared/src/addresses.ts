/** Chain constants and the deployment record. Frozen in T-01a; addresses filled by T-14. */

export const CHAIN_ID = 84532; // Base Sepolia

/** Base Sepolia USDC (FiatTokenV2_2). */
export const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

/** ERC-8004 reference registries on Base Sepolia. Confirmed by T-04. */
export const ERC8004_IDENTITY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;
export const ERC8004_REPUTATION = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const;

/** Referenced in the World feedback document only; nothing calls it. */
export const WORLD_ID_ROUTER = '0x42FF98C4E85212a5D31358ACbFe76a621b50fC02' as const;

export type Address = `0x${string}`;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export interface DeploymentAddresses {
  workerRegistry: Address;
  taskEscrow: Address;
  reputation: Address;
  abuseMark: Address;
  erc8004Identity?: Address;
  erc8004Reputation?: Address;
}

export interface Deployment {
  chainId: number;
  addresses: DeploymentAddresses;
  startBlock: number;
  deployer?: Address;
  deployedAt?: string;
  txs?: Record<string, string>;
}

/**
 * Placeholders until T-14 deploys. Anything reading these before then gets the zero address
 * rather than a stale one — `isDeployed()` is the check to make.
 */
export const PLACEHOLDER_DEPLOYMENT: Deployment = {
  chainId: CHAIN_ID,
  addresses: {
    workerRegistry: ZERO_ADDRESS,
    taskEscrow: ZERO_ADDRESS,
    reputation: ZERO_ADDRESS,
    abuseMark: ZERO_ADDRESS,
    erc8004Identity: ERC8004_IDENTITY,
    erc8004Reputation: ERC8004_REPUTATION,
  },
  startBlock: 0,
};

export function isDeployed(d: Deployment): boolean {
  return Object.values(d.addresses).every((a) => a && a !== ZERO_ADDRESS);
}

/**
 * Reads a `contracts/deployments/*.json` record. Unknown keys are ignored on purpose so
 * T-14 can add provenance fields without an interface change.
 */
export function parseDeployment(raw: unknown): Deployment {
  const o = raw as Partial<Deployment> & { addresses?: Partial<DeploymentAddresses> };
  if (!o || typeof o !== 'object' || !o.addresses) {
    throw new Error('deployment record has no `addresses`');
  }
  const required = ['workerRegistry', 'taskEscrow', 'reputation', 'abuseMark'] as const;
  for (const k of required) {
    if (!o.addresses[k]) throw new Error(`deployment record is missing addresses.${k}`);
  }
  return {
    chainId: o.chainId ?? CHAIN_ID,
    addresses: o.addresses as DeploymentAddresses,
    startBlock: o.startBlock ?? 0,
    ...(o.deployer ? { deployer: o.deployer } : {}),
    ...(o.deployedAt ? { deployedAt: o.deployedAt } : {}),
    ...(o.txs ? { txs: o.txs } : {}),
  };
}
