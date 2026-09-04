// OWNER: T-30 — replace this file; do not edit from any other task
/**
 * The only source of an agent id. A request body never is one: anyone can type
 * `agent_id: 42`, and a mark is a permanent public record against whoever it names.
 *
 * T-30 resolves the payer against the ERC-8004 IdentityRegistry here. Until then every
 * caller is unidentified, which is the safe answer: nothing marks.
 */
import type { Hex } from 'viem';

export async function resolveAgentId(
  _payer: Hex,
  _claimed?: string,
): Promise<{ agentId: bigint; verified: boolean }> {
  return { agentId: 0n, verified: false };
}
