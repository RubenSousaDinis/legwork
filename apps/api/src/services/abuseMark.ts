// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * Marks a refusal against a verified agent id, and only against a verified one.
 *
 * T-30 fills the body. The stub records that it did nothing, so a route that thinks it
 * marked can be caught in a log rather than in a demo.
 */
import type { Hex } from 'viem';
import { logger } from '../log';

export async function markIfIdentified(p: {
  agentId: bigint;
  verified: boolean;
  classId: number;
  specHash: Hex;
  payer: Hex;
}): Promise<{ marked: false } | { marked: true; tx: Hex }> {
  logger.info({ mark_skipped: 'stub', class_id: p.classId, spec_hash: p.specHash }, 'abuse_mark');
  return { marked: false };
}
