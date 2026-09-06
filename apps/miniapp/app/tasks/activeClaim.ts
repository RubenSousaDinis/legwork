/**
 * The worker's one live claim, mirrored on the phone.
 *
 * The authority is the API: `GET /tasks` returns the caller's own live claim as a `claimed`
 * row, and an expired one comes back as `open`. What lives here is a non-secret copy of what
 * `POST /tasks/:id/claim` already answered, so the countdown and the `Go to proof` link render
 * on the first paint of `/tasks` — and so T-33 knows which task the proof screen belongs to
 * without a second round trip.
 */

export const ACTIVE_CLAIM_KEY = 'legwork.activeClaim.v1';

export type ActiveClaim = {
  task_id: string;
  claim_expires_at: string;
  submit_deadline: string;
  tx: string;
};

function isClaim(value: unknown): value is ActiveClaim {
  if (typeof value !== 'object' || value === null) return false;
  const claim = value as Partial<ActiveClaim>;
  return (
    typeof claim.task_id === 'string' &&
    typeof claim.claim_expires_at === 'string' &&
    typeof claim.submit_deadline === 'string' &&
    typeof claim.tx === 'string'
  );
}

export function readActiveClaim(): ActiveClaim | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ACTIVE_CLAIM_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isClaim(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeActiveClaim(claim: ActiveClaim): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(claim));
}

export function clearActiveClaim(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_CLAIM_KEY);
}
