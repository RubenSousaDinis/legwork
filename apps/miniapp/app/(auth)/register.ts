import { ALL_TASK_TYPES_BITMASK } from '@legwork/shared';
import { apiFetch } from '../../lib/api';

/**
 * `POST /register` — the relayed `registerFor`. The worker accepts all four task types in v0,
 * so there is no picker: the bitmask is `verify-open 1 | photo-of 2 | call-confirm 4 |
 * compare-two 8`.
 *
 * `task_types` goes on the wire as that bitmask because the brief's §2 and its
 * `registerBodyExact` acceptance test both spell it `15`. `api-contract.ts` and the merged
 * `apps/api/app/register/route.ts` declare `z.array(z.enum(TASK_TYPES)).min(1)` instead, so
 * the two disagree; the PR body raises it. If the contract wins, this one line becomes
 * `task_types: bitmaskToTaskTypes(ALL_TASK_TYPES_BITMASK)`.
 */
export type RegisterResponse = { tx: string; worker: string };

export function registerWorker(worker_address: string, area: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/register', {
    method: 'POST',
    body: JSON.stringify({ worker_address, area, task_types: ALL_TASK_TYPES_BITMASK }),
  });
}
