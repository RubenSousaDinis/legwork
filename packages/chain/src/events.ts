import { parseEventLogs, type Log, type TransactionReceipt } from 'viem';
import { allEventAbis } from './abi';

export interface DecodedEvent {
  name: string;
  args: Record<string, unknown>;
  txHash: string;
  logIndex: number;
}

/**
 * Every log a Legwork transaction produced, decoded against all four ABIs at once.
 *
 * One release touches the escrow, the reputation ledger and the abuse mark, so a caller that
 * decoded per contract would have to know in advance which of the three a receipt contains.
 * Logs from anything else — a USDC transfer, another protocol in the same block — are dropped.
 */
export function decodeEvents(logs: readonly Log[]): DecodedEvent[] {
  return parseEventLogs({ abi: allEventAbis, logs: logs as Log[] }).map((log) => ({
    name: log.eventName,
    args: (log.args ?? {}) as Record<string, unknown>,
    txHash: log.transactionHash ?? '',
    logIndex: log.logIndex ?? 0,
  }));
}

/**
 * The task id a `post` produced. It only exists in the `TaskPosted` event: the contract
 * returns it, but a return value is not readable from a receipt.
 */
export function taskIdFromReceipt(receipt: TransactionReceipt): bigint {
  const posted = decodeEvents(receipt.logs).find((e) => e.name === 'TaskPosted');
  if (!posted) throw new Error('receipt carries no TaskPosted event');
  return posted.args['taskId'] as bigint;
}
