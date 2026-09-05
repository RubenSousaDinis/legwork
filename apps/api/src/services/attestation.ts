/**
 * The registration attestation — the one digest Solidity and TypeScript must agree on.
 *
 * Registration is **operator-attested**: the API signs an EIP-712 `Attestation` with the
 * operator's attestation-verifier key and the `WorkerRegistry` checks that signature before
 * it binds a nullifier to an address. That key signs offchain only and never sends a
 * transaction; a compromise of it is a disclosed single-signer risk, and it is one of four
 * keys with one job each.
 *
 * The domain, the type list and the field order below are `IWorkerRegistry`'s, not this
 * file's opinion — `contracts/test/fixtures/attestation.json` is the shared vector both
 * sides recompute, so a drift here fails a Forge test as well as a Vitest one.
 *
 * `area` is passed to `hashTypedData` as a plain `string`: EIP-712 hashes it with
 * `keccak256(bytes(area))` internally, and hashing it by hand first would double-hash it.
 */
import { hashTypedData, type Address, type Hex, type TypedDataDomain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TASK_TYPE_BIT, type TaskType } from '@legwork/shared';
import { getConfig } from '../config';

/** `Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)` */
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'nullifierHash', type: 'uint256' },
    { name: 'worker', type: 'address' },
    { name: 'area', type: 'string' },
    { name: 'taskTypes', type: 'uint8' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const ATTESTATION_PRIMARY_TYPE = 'Attestation' as const;

export interface AttestationMessage {
  nullifierHash: bigint;
  worker: Address;
  area: string;
  taskTypes: number;
  deadline: bigint;
}

export interface AttestationDomain extends TypedDataDomain {
  name: 'Legwork WorkerRegistry';
  version: '1';
  chainId: number;
  verifyingContract: Address;
}

export function attestationDomain(chainId: number, verifyingContract: Address): AttestationDomain {
  return { name: 'Legwork WorkerRegistry', version: '1', chainId, verifyingContract };
}

export function attestationDigest(domain: AttestationDomain, message: AttestationMessage): Hex {
  return hashTypedData({
    domain,
    types: ATTESTATION_TYPES,
    primaryType: ATTESTATION_PRIMARY_TYPE,
    message,
  });
}

export function signAttestation(
  privateKey: Hex,
  domain: AttestationDomain,
  message: AttestationMessage,
): Promise<Hex> {
  return privateKeyToAccount(privateKey).signTypedData({
    domain,
    types: ATTESTATION_TYPES,
    primaryType: ATTESTATION_PRIMARY_TYPE,
    message,
  });
}

/**
 * The `uint8` bitmask the registry stores. Deduped, because a client that sends the same
 * type twice means the same worker, and bounded to `1..15` because a mask outside that
 * range is a type the contract does not know.
 */
export function taskTypesMask(taskTypes: readonly TaskType[]): number {
  let mask = 0;
  for (const type of taskTypes) mask |= TASK_TYPE_BIT[type];
  if (mask < 1 || mask > 15) throw new Error('taskTypesMask: expected a mask in 1..15');
  return mask;
}

/** The address the registry's `attestationVerifier` must be set to. T-14 reads it at deploy. */
export function verifierAddress(): Address {
  return privateKeyToAccount(getConfig().ATTESTATION_VERIFIER_PRIVATE_KEY as Hex).address;
}

/**
 * The one signer in this service. The verifier key is read here and never handed to a route:
 * a caller passes a message and gets bytes back, so the key has no path out of `src/services`.
 */
export function signConfiguredAttestation(message: AttestationMessage): Promise<Hex> {
  return signAttestation(getConfig().ATTESTATION_VERIFIER_PRIVATE_KEY as Hex, configuredDomain(), message);
}

/** The domain this instance signs under: Base Sepolia and the deployed registry. */
export function configuredDomain(): AttestationDomain {
  const config = getConfig();
  const verifyingContract = config.WORKER_REGISTRY_ADDRESS;
  if (!verifyingContract) throw new Error('WORKER_REGISTRY_ADDRESS is not set');
  return attestationDomain(config.CHAIN_ID, verifyingContract as Address);
}
