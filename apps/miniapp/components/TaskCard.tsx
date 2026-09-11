'use client';

import { CLAIM_RADIUS_M, DEFAULT_CLAIM_TTL_S, GEOFENCE_M, type TaskType } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { clearActiveClaim } from '../app/tasks/activeClaim';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Countdown } from './Countdown';
import { MonoTag } from './ui/MonoTag';
import { Waiting } from './ui/Waiting';

/**
 * One row of `GET /tasks`, in its three states: collapsed, expanded, and claimed.
 *
 * The expanded card is a stack of labelled rows — `type`, `name`, `meta`, `question`,
 * `proof`, `claim`, `relayed` — each marked `data-row`, in that order and no other. The
 * collapsed row is one mono line, its meta and the price.
 *
 * The price shown is `price_usdc` — the posted rate the worker keeps, never a figure with the
 * fee taken out of it. The agent pays 3.45, escrow locks 3.45, the worker receives 3.00 and
 * the fee is 0.45 on top; this screen only ever shows the worker's 3.00.
 */

/**
 * `WorkerBrief` in `api-contract.ts` — place and question fields only, never `claimed_*` or
 * `source`. Every field is optional, and a row that carries none of them renders the
 * type-derived copy on its own.
 */
export type TaskBrief = {
  /** `country` is the agent's own ISO-3166-1 alpha-2 code; the proof screen prices in it. */
  place?: { name: string; street_address: string; locality: string; country?: string };
  question?: string;
  subject?: string;
  subject_detail?: string;
  phone?: string;
  template_question?: string;
  slots?: Record<string, string>;
  criterion_id?: string;
};

/** `WorkerTaskRow` in `api-contract.ts`. */
export type TaskRow = {
  task_id: string;
  task_type: TaskType;
  title: string;
  price_usdc: number;
  distance_m?: number;
  claim_expires_in_s?: number;
  state: 'open' | 'claimed';
  seeded: boolean;
  brief?: TaskBrief;
  /** Task place, 3 decimals (~100 m). Never the exact coordinate. */
  coordinate_rounded?: { lat: number; lon: number };
};

/** The caller's own live claim — `localStorage['legwork.activeClaim.v1']`, verbatim. */
export type TaskCardClaim = {
  task_id: string;
  claim_expires_at: string;
  submit_deadline: string;
  tx: string;
};

export type TaskCardProps = {
  row: TaskRow;
  expanded: boolean;
  onToggle: () => void;
  onClaim: () => void;
  /** This row's claim is in flight: the relay has the transaction and has not answered. */
  claiming?: boolean;
  claim?: TaskCardClaim;
  onRelease: () => void;
  error?: string;
};

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const RELAYED_CHIP = 'relayed claim · gas paid by Legwork';
export const PAID_FOR_THE_PROOF = 'you are paid for the proof, not the answer';
export const CLAIM_EXPIRED = 'claim expired — it returned to the pool';

/**
 * A seeded row shows what an agent asks for. No escrow stands behind it, so the API answers a
 * claim on one with 409 `SeededDemoRow` before it reaches the chain — and a CLAIM button that
 * can only fail is a lie the card tells before the worker ever taps it. The button is gone and
 * this line stands in its place.
 */
export const SEEDED_NOT_CLAIMABLE =
  'Seeded demo row — shows what an agent asks for. Not claimable; no escrow behind it.';

/**
 * A claim is a relayed transaction, so there are seconds between the tap and the answer.
 * The button keeps its name and stops accepting taps — a second tap used to send a second
 * claim — and the line under it says what those seconds are.
 */
export const CLAIMING_LINE = 'Claiming this task…';

/**
 * The claim window closing does not hand the task back: `TaskEscrow.expire` is what moves the
 * state, it needs `claimedAt + submitTTL` rather than the claim TTL, and nothing fires it by
 * itself. Until then `activeClaimOf` still names this task and the worker cannot claim
 * anything else — so the way out has to stay on the card.
 */
export const CLAIM_STILL_HELD =
  'This task is still assigned to you on-chain, so you cannot claim another until you hand it back.';

/** The claim window as a sentence. 1800 s is 30 min; never written as a bare `30m`. */
export const TTL_LINE = `claim within ${Math.round(DEFAULT_CLAIM_TTL_S / 60)} min`;

export const QUESTION: Record<TaskType, string> = {
  'verify-open': 'Is it open right now?',
  'photo-of': 'Photograph the subject named in the title',
  'call-confirm': 'Call and ask the template question shown after you claim',
  'compare-two': 'Pick A or B against the criterion shown after you claim',
};

/**
 * What has to come back with the answer, as `·` lines. The two photograph types ask for the
 * same three things; the other two ask for what they ask for and say what is unverified.
 */
const PROOF_LINES: Record<TaskType, readonly string[]> = {
  'verify-open': ['photo of the door + hours sign', 'location · timestamp'],
  'photo-of': ['photo of the door + hours sign', 'location · timestamp'],
  'call-confirm': ['your answer + the time you called — self-reported, unverified'],
  'compare-two': ['one choice + one line'],
};

/** `~180 m` at street scale, `~1.2 km` beyond it — never a raw metre count, never a coordinate. */
export function formatDistance(distance_m?: number): string {
  if (distance_m === undefined || !Number.isFinite(distance_m)) return 'distance unavailable';
  if (distance_m >= 1000) return `~${(distance_m / 1000).toFixed(1)} km`;
  return `~${Math.round(distance_m / 10) * 10} m`;
}

export function claimConfirmation(row: TaskRow): string {
  const place = row.brief?.place?.name ?? row.title;
  const windowMin = Math.round(DEFAULT_CLAIM_TTL_S / 60);
  const fence = `You have ${windowMin} minutes to get there, and your proof photo must be taken within ${GEOFENCE_M} m of it.`;
  if (row.distance_m === undefined || !Number.isFinite(row.distance_m)) {
    return `${place}. ${fence}`;
  }
  return `${place} is ${formatDistance(row.distance_m)} away. ${fence}`;
}

export function tooFarToClaimReason(distance_m: number): string {
  return `Too far to claim — you are ${formatDistance(distance_m)} away, and a claim must start within 2 km`;
}

/** First 6 characters, then the last 4 — the hash is a link, not something to read out. */
export function shortTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

/** `Rua de Alcobaça 12, Leiria` when the brief carries a place, nothing when it does not. */
export function placePrefix(row: TaskRow): string | null {
  const place = row.brief?.place;
  return place === undefined ? null : `${place.street_address}, ${place.locality}`;
}

/**
 * What to call this errand on the card. `title` is the place — `Churrasqueira · Rua de
 * Parceiros` — and is empty when the spec named none, in which case the question is the only
 * true thing left to show. Never blank, never a bare separator.
 */
export function taskName(row: TaskRow): string {
  return row.title === '' ? QUESTION[row.task_type] : row.title;
}

export const DIRECTIONS_LABEL = 'Get directions';

/** Google Maps directions to the posted address — never a coordinate. */
export function directionsHref(place: {
  name: string;
  street_address: string;
  locality: string;
}): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${place.name}, ${place.street_address}, ${place.locality}`,
  )}`;
}

export function TaskCard({
  row,
  expanded,
  onToggle,
  onClaim,
  claiming = false,
  claim,
  onRelease,
  error,
}: TaskCardProps) {
  const router = useRouter();
  const claimed = claim !== undefined && claim.task_id === row.task_id;
  const open = expanded || claimed;

  return (
    <li
      className={open ? 'lw-card' : 'lw-card lw-card--tight'}
      data-task={row.task_id}
      data-claimed={claimed ? 'true' : 'false'}
    >
      <button
        aria-expanded={open}
        className="lw-task-summary lw-plain-button"
        data-hit="44"
        onClick={onToggle}
        type="button"
      >
        {open ? (
          <>
            <span className="lw-task-row" data-row="type">
              <span className="lw-chips">
                <MonoTag>{row.task_type}</MonoTag>
                {row.seeded ? (
                  <Chip tone="seeded" floor={20}>
                    seeded
                  </Chip>
                ) : null}
              </span>
              {/* Not amber: DESIGN-SPEC reserves amber for refusals, and a claim window
                  running out is neither a refusal nor an error. */}
              <span className="lw-meta lw-meta--flush lw-meta--strong" data-ttl="true">
                {TTL_LINE}
              </span>
            </span>

            <span className="lw-task-row" data-row="name">
              <span
                className="lw-task-title lw-task-name"
                {...(claimed ? { 'data-floor': '20' } : {})}
              >
                {taskName(row)}
              </span>
              <PriceTag price={row.price_usdc} />
            </span>

            <span className="lw-meta" data-row="meta">
              {placePrefix(row) === null ? null : `${placePrefix(row)} · `}
              <span data-distance="true">{formatDistance(row.distance_m)}</span>
              {` · you keep the full ${row.price_usdc.toFixed(2)}`}
            </span>
          </>
        ) : (
          <span className="lw-task-row lw-task-row--collapsed">
            <span className="lw-task-summary__left">
              <span className="lw-chips">
                <span className="lw-task-line">
                  {`${row.task_type} · `}
                  <span className="lw-task-title">{taskName(row)}</span>
                </span>
                {row.seeded ? (
                  <Chip tone="seeded" floor={20}>
                    seeded
                  </Chip>
                ) : null}
              </span>
              <span className="lw-meta lw-meta--flush">
                <span data-distance="true">{formatDistance(row.distance_m)}</span>
                {' · '}
                <span data-ttl="true">{TTL_LINE}</span>
              </span>
            </span>
            <PriceTag price={row.price_usdc} small />
          </span>
        )}
      </button>

      {open ? (
        <div className="lw-task-body">
          <hr className="lw-rule" />

          <p className="lw-question" data-row="question">
            {QUESTION[row.task_type]}
          </p>
          <BriefDetail row={row} />

          <div data-row="proof">
            {PROOF_LINES[row.task_type].map((line) => (
              <p className="lw-fact" key={line}>
                {line}
              </p>
            ))}
            <p className="lw-note">{PAID_FOR_THE_PROOF}</p>
          </div>

          {claimed ? (
            <div data-row="claim">
              <ClaimedActions
                claim={claim}
                onRelease={onRelease}
                router={router}
                stillHeld={row.state === 'claimed'}
                taskId={row.task_id}
              />
            </div>
          ) : row.seeded ? (
            <div data-floor="20" data-row="claim">
              <p className="lw-body" data-claim="seeded" data-floor="20">
                {SEEDED_NOT_CLAIMABLE}
              </p>
            </div>
          ) : (
            <ClaimButton claiming={claiming} onClaim={onClaim} row={row} />
          )}

          <p className="lw-chips lw-chips--centred" data-row="relayed">
            <Chip tone="verified" floor={20}>
              {RELAYED_CHIP}
            </Chip>
          </p>

          {error === undefined ? null : (
            <p className="lw-error-line" data-error="claim">
              {error}
            </p>
          )}
        </div>
      ) : null}

      {row.brief?.place !== undefined ? (
        <a
          className="lw-directions"
          data-directions="true"
          data-hit="44"
          href={directionsHref(row.brief.place)}
          rel="noreferrer"
          target="_blank"
        >
          {DIRECTIONS_LABEL}
        </a>
      ) : null}
    </li>
  );
}

function ClaimButton({
  row,
  onClaim,
  claiming,
}: {
  row: TaskRow;
  onClaim: () => void;
  claiming: boolean;
}) {
  const tooFar =
    row.distance_m !== undefined &&
    Number.isFinite(row.distance_m) &&
    row.distance_m > CLAIM_RADIUS_M;

  return (
    <div data-floor="20" data-row="claim">
      {tooFar ? (
        <p className="lw-body" data-claim="too-far" data-floor="20">
          {tooFarToClaimReason(row.distance_m as number)}
        </p>
      ) : (
        <p className="lw-body" data-claim="confirm" data-floor="20">
          {claimConfirmation(row)}
        </p>
      )}
      {/* The label does not change: an action keeps its name through the whole flow, and
          the waiting line under it is what says the flow is running. */}
      <Button disabled={tooFar || claiming} full onClick={onClaim} size="lg" variant="primary">
        CLAIM
      </Button>
      {claiming ? <Waiting step="claim">{CLAIMING_LINE}</Waiting> : null}
    </div>
  );
}

/**
 * The posted rate: the numeral in Archivo and its unit in mono, two nodes on one baseline
 * that never break apart. The collapsed figure carries `data-floor="20"`, so it renders at
 * the floor rather than at the prototype's 17 px.
 */
function PriceTag({ price, small = false }: { price: number; small?: boolean }) {
  return (
    <span className="lw-price">
      <span
        className={small ? 'lw-price__figure lw-price__figure--sm' : 'lw-price__figure'}
        data-floor="20"
        data-price="usdc"
      >
        {price.toFixed(2)}
      </span>
      <span className="lw-price__unit">USDC</span>
    </span>
  );
}

/**
 * What the worker is actually being asked, when the row says. The question line above is
 * derived from `task_type` and is the same for every task of that type; this is the one line
 * that differs — the thing to photograph, the question to read down the phone, the criterion
 * to pick against. A row whose `brief` does not carry it renders nothing extra.
 *
 * `verify-open` needs nothing more: "Is it open right now?" is the whole question.
 */
function BriefDetail({ row }: { row: TaskRow }) {
  const brief = row.brief;
  if (brief === undefined) return null;

  if (row.task_type === 'photo-of' && brief.subject !== undefined) {
    const detail = brief.subject_detail;
    return (
      <p className="lw-body" data-brief="subject">
        {detail === undefined ? brief.subject : `${brief.subject} — ${detail}`}
      </p>
    );
  }

  if (row.task_type === 'call-confirm' && brief.template_question !== undefined) {
    return (
      <p className="lw-body" data-brief="template_question">
        {brief.template_question}
      </p>
    );
  }

  if (row.task_type === 'compare-two' && brief.criterion_id !== undefined) {
    return (
      <p className="lw-body" data-brief="criterion_id">
        <MonoTag>{brief.criterion_id}</MonoTag>
      </p>
    );
  }

  return null;
}

type ClaimedActionsProps = {
  claim: TaskCardClaim;
  onRelease: () => void;
  router: ReturnType<typeof useRouter>;
  taskId: string;
  /** `GET /tasks/list` still marking this row `claimed` — it is ours until we give it back. */
  stillHeld: boolean;
};

/**
 * The claimed state. At `00:00` the claim is gone — the task went back to the pool — so the
 * actions go with it rather than sitting there ready to fail.
 *
 * Expiry clears `localStorage['legwork.activeClaim.v1']` here, where the clock is, rather than
 * through a prop `TaskCard` does not have: the stored claim is the one thing the card and the
 * list both read, so the next poll un-pins the card on its own.
 */
function ClaimedActions({ claim, onRelease, router, stillHeld, taskId }: ClaimedActionsProps) {
  // Reset during render, not in an effect: `Countdown` is a child, so its effects run first,
  // and a claim that is already past its deadline would have its `onExpire` undone by a
  // parent effect firing afterwards.
  const [clock, setClock] = useState({ until: claim.claim_expires_at, expired: false });
  if (clock.until !== claim.claim_expires_at) {
    setClock({ until: claim.claim_expires_at, expired: false });
  }

  const onExpire = useCallback(() => {
    clearActiveClaim();
    setClock((current) => ({ ...current, expired: true }));
  }, []);

  if (clock.expired) {
    if (!stillHeld) {
      return (
        <p className="lw-body" data-claim="expired" data-floor="20">
          {CLAIM_EXPIRED}
        </p>
      );
    }
    return (
      <div className="lw-actions" data-claim="expired">
        <p className="lw-body" data-floor="20">
          {CLAIM_STILL_HELD}
        </p>
        <Button variant="ghost" onClick={onRelease}>
          release this claim
        </Button>
      </div>
    );
  }

  return (
    <div className="lw-actions">
      <Countdown label="claim expires in" onExpire={onExpire} until={claim.claim_expires_at} />

      {/* A claim recovered from the board carries no receipt — the row does not have one to
          give. Better no chip than a Basescan link to nothing. */}
      {claim.tx === '' ? null : (
        <p className="lw-chips">
          <Chip tone="neutral" floor={20}>
            <a data-hit="44" href={`${BASESCAN_TX}${claim.tx}`} rel="noreferrer" target="_blank">
              {`tx ${shortTx(claim.tx)} ↗`}
            </a>
          </Chip>
        </p>
      )}

      <Button variant="primary" size="lg" full onClick={() => router.push(`/proof/${taskId}`)}>
        Go to proof
      </Button>

      <Button variant="ghost" onClick={onRelease}>
        release this claim
      </Button>
    </div>
  );
}
