import type { Address, Hex, TransactionReceipt } from 'viem';
import { workerRegistryAbi } from '../abi.js';
import { ContractClient } from './base.js';

/** `IWorkerRegistry`. Method names are the Solidity ones. */
export class RegistryClient extends ContractClient {
  protected readonly abi = workerRegistryAbi;

  isWorker(worker: Address): Promise<boolean> {
    return this.read('isWorker', [worker]);
  }
  isSeeded(worker: Address): Promise<boolean> {
    return this.read('isSeeded', [worker]);
  }
  nullifierOf(worker: Address): Promise<bigint> {
    return this.read('nullifierOf', [worker]);
  }
  workerOf(nullifierHash: bigint): Promise<Address> {
    return this.read('workerOf', [nullifierHash]);
  }
  areaOf(worker: Address): Promise<string> {
    return this.read('areaOf', [worker]);
  }
  taskTypesOf(worker: Address): Promise<number> {
    return this.read('taskTypesOf', [worker]);
  }
  relayer(): Promise<Address> {
    return this.read('relayer');
  }
  attestationVerifier(): Promise<Address> {
    return this.read('attestationVerifier');
  }

  registerFor(
    nullifierHash: bigint,
    worker: Address,
    area: string,
    taskTypes: number,
    deadline: bigint,
    attestation: Hex,
  ): Promise<TransactionReceipt> {
    return this.write('relayer', 'registerFor', [
      nullifierHash,
      worker,
      area,
      taskTypes,
      deadline,
      attestation,
    ]);
  }

  seedWorker(
    worker: Address,
    syntheticNullifier: bigint,
    area: string,
    taskTypes: number,
  ): Promise<TransactionReceipt> {
    return this.write('owner', 'seedWorker', [worker, syntheticNullifier, area, taskTypes]);
  }

  resetWorker(nullifierHash: bigint): Promise<TransactionReceipt> {
    return this.write('owner', 'resetWorker', [nullifierHash]);
  }

  setRelayer(relayer: Address): Promise<TransactionReceipt> {
    return this.write('owner', 'setRelayer', [relayer]);
  }

  setAttestationVerifier(verifier: Address): Promise<TransactionReceipt> {
    return this.write('owner', 'setAttestationVerifier', [verifier]);
  }
}
