import { TASK_TYPES } from '@legwork/shared';
import { apiFetch } from '../../lib/api';

/**
 * `POST /register` — the relayed `registerFor`. The worker accepts all four task types in v0,
 * so there is no picker: the bitmask is `verify-open 1 | photo-of 2 | call-confirm 4 |
 * compare-two 8`.
 *
 * `task_types` goes on the wire as the array of all four type names. The brief's §2 and its
 * `registerBodyExact` spelled it as the bitmask `15`; `api-contract.ts` and the merged
 * `apps/api/app/register/route.ts` both declare `z.array(z.enum(TASK_TYPES)).min(1)`, and the
 * PR #85 review ruled that the contract wins.
 */
export type RegisterResponse = { tx: string; worker: string };

export function registerWorker(worker_address: string, area: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/register', {
    method: 'POST',
    body: JSON.stringify({ worker_address, area, task_types: TASK_TYPES }),
  });
}
