import { describe, expect, it } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  stringToHex,
  type AbiEvent,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { taskEscrowAbi } from '../src/abi.js';
import { decodeEvents, taskIdFromReceipt } from '../src/events.js';

const BUYER = '0x00000000000000000000000000000000000000b1' as const;
const SPEC_HASH = keccak256(stringToHex('verify-open · Farmácia Central'));

/** A real `TaskPosted` log, encoded from the frozen ABI rather than typed out by hand. */
function taskPostedLog(taskId: bigint): Log {
  const event = taskEscrowAbi.find(
    (item) => item.type === 'event' && item.name === 'TaskPosted',
  ) as AbiEvent;
  const topics = encodeEventTopics({
    abi: taskEscrowAbi,
    eventName: 'TaskPosted',
    args: { taskId, buyer: BUYER },
  });
  const data = encodeAbiParameters(
    event.inputs.filter((input) => !input.indexed),
    [0n, 1, SPEC_HASH, 3_000_000n, 450_000n, 'ez5ku', 1800, 3600, 86_400],
  );
  return {
    address: '0x00000000000000000000000000000000000000e5',
    // `encodeEventTopics` widens its result; a `Log` wants the non-empty tuple.
    topics: topics as [Hex, ...Hex[]],
    data,
    blockHash: keccak256(stringToHex('block')),
    blockNumber: 12n,
    logIndex: 0,
    transactionHash: keccak256(stringToHex('tx')),
    transactionIndex: 0,
    removed: false,
  };
}

function receiptWith(logs: Log[]): TransactionReceipt {
  return { logs, blockNumber: 12n } as TransactionReceipt;
}

describe('events', () => {
  it('taskIdFromReceipt decodes TaskPosted', () => {
    const receipt = receiptWith([taskPostedLog(1n)]);

    expect(taskIdFromReceipt(receipt)).toBe(1n);

    const decoded = decodeEvents(receipt.logs);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.name).toBe('TaskPosted');
    expect(decoded[0]?.args['amount']).toBe(3_000_000n);
    expect(decoded[0]?.args['fee']).toBe(450_000n);

    expect(() => taskIdFromReceipt(receiptWith([]))).toThrow('no TaskPosted event');
  });
});
