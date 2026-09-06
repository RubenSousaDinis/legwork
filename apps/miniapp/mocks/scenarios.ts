/**
 * The switchboard for `mocks/handlers.ts`. T-25, T-33 and T-42 cannot edit the mocks, so every
 * branch their tests need is a named scenario here: `setScenario({ tasks: 'empty' })` before
 * the render, and `mocks/server.ts` puts everything back after each test.
 */

export type Scenarios = {
  /** `POST /idkit/verify`: verified, or one-person-one-account. */
  idkitVerify: 'ok' | 'nullifier_already_registered';
  /** `GET /tasks`: two open rows, or nothing near the worker. */
  tasks: 'two_rows' | 'empty';
  /** `POST /tasks/:id/claim`: the four answers the contract allows. */
  claim: 'ok' | 'InCooldown' | 'AlreadyClaimed' | 'SeededCannotClaimExternal';
  /** `POST /tasks/:id/submit`: accepted, or auto-disputed at submit time. */
  submit: 'submitted' | 'disputed';
  /** `GET /me/earnings`: nothing earned yet, one released task, or no session. */
  earnings: 'zero' | 'one_paid' | 'unauthorized';
  /** `GET /tasks/:id`: waiting on the poster, or paid with the proof beside it. */
  task: 'submitted' | 'released';
};

export const DEFAULT_SCENARIOS: Scenarios = {
  idkitVerify: 'ok',
  tasks: 'two_rows',
  claim: 'ok',
  submit: 'submitted',
  earnings: 'zero',
  task: 'submitted',
};

let current: Scenarios = { ...DEFAULT_SCENARIOS };

export function scenario(): Scenarios {
  return current;
}

export function setScenario(patch: Partial<Scenarios>): void {
  current = { ...current, ...patch };
}

export function resetScenarios(): void {
  current = { ...DEFAULT_SCENARIOS };
}
