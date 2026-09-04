import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { newMockEvent } from "matchstick-as/assembly/index";
import {
  WorkerRegistered,
  WorkerReset,
  WorkerSeeded,
} from "../generated/WorkerRegistry/WorkerRegistry";
import { BuyerAllowlisted, TaskPosted } from "../generated/TaskEscrow/TaskEscrow";

/** Every mock event is emitted at this timestamp unless a test says otherwise. */
export const AT: BigInt = BigInt.fromI32(1_700_000_000);

export function addr(hex: string): Address {
  return Address.fromString(hex);
}

function param(name: string, value: ethereum.Value): ethereum.EventParam {
  return new ethereum.EventParam(name, value);
}

export function mockWorkerRegistered(
  nullifierHash: BigInt,
  worker: Address,
  area: string,
  taskTypes: i32,
): WorkerRegistered {
  const event = changetype<WorkerRegistered>(newMockEvent());
  event.block.timestamp = AT;
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(param("nullifierHash", ethereum.Value.fromUnsignedBigInt(nullifierHash)));
  event.parameters.push(param("worker", ethereum.Value.fromAddress(worker)));
  event.parameters.push(param("area", ethereum.Value.fromString(area)));
  event.parameters.push(param("taskTypes", ethereum.Value.fromI32(taskTypes)));
  return event;
}

export function mockWorkerSeeded(
  syntheticNullifier: BigInt,
  worker: Address,
  area: string,
  taskTypes: i32,
): WorkerSeeded {
  const event = changetype<WorkerSeeded>(newMockEvent());
  event.block.timestamp = AT;
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    param("syntheticNullifier", ethereum.Value.fromUnsignedBigInt(syntheticNullifier)),
  );
  event.parameters.push(param("worker", ethereum.Value.fromAddress(worker)));
  event.parameters.push(param("area", ethereum.Value.fromString(area)));
  event.parameters.push(param("taskTypes", ethereum.Value.fromI32(taskTypes)));
  return event;
}

/** The demo price everywhere: the agent pays 3.45, of which 3.00 is the worker's rate. */
export const AMOUNT: BigInt = BigInt.fromString("3000000");
export const FEE: BigInt = BigInt.fromString("450000");

export function mockTaskPosted(taskId: i32, buyer: Address, area: string): TaskPosted {
  const event = changetype<TaskPosted>(newMockEvent());
  event.block.timestamp = AT;
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(param("taskId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(taskId))));
  event.parameters.push(param("buyer", ethereum.Value.fromAddress(buyer)));
  event.parameters.push(param("buyerAgentId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))));
  event.parameters.push(param("taskType", ethereum.Value.fromI32(1)));
  event.parameters.push(
    param("specHash", ethereum.Value.fromFixedBytes(Bytes.fromI32(taskId) as Bytes)),
  );
  event.parameters.push(param("amount", ethereum.Value.fromUnsignedBigInt(AMOUNT)));
  event.parameters.push(param("fee", ethereum.Value.fromUnsignedBigInt(FEE)));
  event.parameters.push(param("area", ethereum.Value.fromString(area)));
  event.parameters.push(param("claimTTL", ethereum.Value.fromI32(900)));
  event.parameters.push(param("submitTTL", ethereum.Value.fromI32(1800)));
  event.parameters.push(param("disputeWindow", ethereum.Value.fromI32(3600)));
  return event;
}

export function mockBuyerAllowlisted(buyer: Address, allowed: boolean): BuyerAllowlisted {
  const event = changetype<BuyerAllowlisted>(newMockEvent());
  event.block.timestamp = AT;
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(param("buyer", ethereum.Value.fromAddress(buyer)));
  event.parameters.push(param("allowed", ethereum.Value.fromBoolean(allowed)));
  return event;
}

export function mockWorkerReset(nullifierHash: BigInt, worker: Address): WorkerReset {
  const event = changetype<WorkerReset>(newMockEvent());
  event.block.timestamp = AT;
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(param("nullifierHash", ethereum.Value.fromUnsignedBigInt(nullifierHash)));
  event.parameters.push(param("worker", ethereum.Value.fromAddress(worker)));
  return event;
}
