'use client';

import { CLAIM_COOLDOWN_S } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EarningsBar } from '../../components/EarningsBar';
import { TaskCard, formatDistance, type TaskRow } from '../../components/TaskCard';
import { TaskMap } from '../../components/TaskMap';
import { Chip } from '../../components/ui/Chip';
import { ApiError, apiFetch } from '../../lib/api';
import { lastKnownPosition, resolveArea } from '../../lib/area';
import { GEOCODE_DEBOUNCE_MS, focusFromPoints, geocodeAddress, type GeocodeHit } from '../../lib/geocode';
import { NEAR_ME_M, rowMatchesQuery } from '../../lib/search';
import { clearActiveClaim, readActiveClaim, writeActiveClaim, type ActiveClaim } from './activeClaim';
import { Waiting } from '../../components/ui/Waiting';

/**
 * The worker's task list. It polls `GET /tasks/list` every 3 seconds because a claim is a race —
 * a row that is gone needs to disappear before the worker walks to it — and it stops polling
 * the moment the tab is hidden, because a phone in a pocket has no reason to keep asking.
 */

const POLL_MS = 3000;
const EARNINGS_POLL_MS = 60_000;

/** The same honesty chip the proof screen uses when the webview will not give a fix. */
export const GPS_UNAVAILABLE_CHIP = 'GPS unavailable in webview — disclosed';

export const NOT_SPENDABLE = 'not spendable';
export const NEARBY_TASKS = 'OPEN TASKS';

export const SEARCH_LABEL = 'Search by city, street, place or type';
export const NEAR_ME_LABEL = 'near me';
export const NEAR_ME_NEEDS_FIX = 'Needs a GPS fix — distance is unknown without one.';

export function emptyBoardCopy(): string {
  return 'No open tasks right now. The list refreshes every 3 s.';
}

/** Before the first answer. The board says it is asking, never that there is nothing. */
export const LOOKING_FOR_TASKS = 'Looking for open tasks near you…';

/**
 * The first read did not come back. `emptyBoardCopy()` would be a claim this screen cannot
 * make — "no open tasks" and "I could not ask" are different facts — so it says which one
 * this is, and that it is still trying.
 */
export const BOARD_UNREACHABLE = 'The task list did not load. Retrying every 3 s.';

export function emptySearchCopy(): string {
  return 'No tasks match this search.';
}

/** The three 409/403 answers `POST /tasks/:id/claim` is allowed to give, in the worker's words. */
export const CLAIM_ERRORS: Record<string, string> = {
  InCooldown: `You released or let a claim expire recently. You can claim again within ${Math.round(
    CLAIM_COOLDOWN_S / 60,
  )} min.`,
  AlreadyClaimed: 'Someone claimed this task first.',
  SeededCannotClaimExternal:
    'This account is a seeded demo worker; it can only claim operator-funded tasks.',
};

/**
 * `AlreadyClaimed` answers two different questions with one word: someone else got there
 * first, or *you* already hold a claim — the API separates them by sending `active_task_id`
 * only in the second case. Telling a worker holding task 31 that someone claimed it first is
 * a lie about their own claim, and it sent an operator looking for a task they already had.
 */
export function heldByYou(taskId: string): string {
  return `You already have task #${taskId} claimed. Submit it or release it before claiming another.`;
}

const GENERIC_ERROR = 'That did not go through. Try again in a moment.';

type TasksResponse = { tasks: TaskRow[] };
type ClaimResponse = { tx: string; claim_expires_at: string; submit_deadline: string };
type Earnings = { released_usdc: number };

function errorCode(thrown: unknown): string | null {
  if (!(thrown instanceof ApiError)) return null;
  const body = thrown.body as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : null;
}

/**
 * The claim the API says is ours, when the phone has forgotten it.
 *
 * `activeClaim.ts` calls itself "a non-secret copy" of what the API already answered, and the
 * API is explicit: `GET /tasks/list` marks a row `claimed` only for the caller's own live
 * claim (`route.ts:77` — `sameAddress(row.worker, caller)`; anyone else's claim comes back
 * `open`). But the card read `claimed` from the mirror alone, so a worker whose localStorage
 * went — a webview reload, a new session, cleared storage — saw a CLAIM button on a task they
 * were already holding. Tapping it returned `AlreadyClaimed`, and there was no way to reach
 * `Go to proof` or `release this claim`: the task was theirs and unreachable until the TTL ran
 * out. An operator hit exactly this, on the street, holding task 31.
 *
 * `tx` is not on the row and is not invented — the claim receipt chip is dropped for a
 * recovered claim, and the countdown and both actions come back.
 */
export function recoverClaim(rows: TaskRow[], now: number = Date.now()): ActiveClaim | null {
  if (readActiveClaim() !== null) return null;
  // Not gated on time left: a claim past its window is still `activeClaimOf` on the contract
  // until `expire` or `releaseClaim` runs, and recovering only live claims left the worker
  // holding a task with no card and so no way to hand it back.
  const mine = rows.find((row) => row.state === 'claimed');
  if (mine === undefined) return null;
  const expiresAt = new Date(now + (mine.claim_expires_in_s ?? 0) * 1000).toISOString();
  return {
    task_id: mine.task_id,
    claim_expires_at: expiresAt,
    submit_deadline: expiresAt,
    tx: '',
  };
}

function claimErrorMessage(thrown: unknown): string {
  const code = errorCode(thrown);
  if (code === 'AlreadyClaimed' && thrown instanceof ApiError) {
    const body = thrown.body as { active_task_id?: unknown } | null;
    if (typeof body?.active_task_id === 'string') return heldByYou(body.active_task_id);
  }
  if (code === 'too_far_to_claim' && thrown instanceof ApiError) {
    const body = thrown.body as { distance_m?: unknown } | null;
    const distance = typeof body?.distance_m === 'number' ? body.distance_m : undefined;
    return `Too far to claim — you are ${formatDistance(distance)} away, and a claim must start within 2 km`;
  }
  return (code && CLAIM_ERRORS[code]) || GENERIC_ERROR;
}

/**
 * `GET /tasks/list`, not `GET /tasks`: `apps/api/app/tasks/route.ts` is POST-only so that T-16
 * and T-17 never share a file, and the worker's board is a route of its own.
 *
 * The board is global: `area` is not sent. `lat`/`lon` ride along only so the API can sort
 * nearest-first and fill `distance_m`, and only when the worker already granted the permission.
 */
function tasksPath(): string {
  const params = new URLSearchParams();
  const position = lastKnownPosition();
  if (position !== null) {
    params.set('lat', String(position.lat));
    params.set('lon', String(position.lon));
  }
  const query = params.toString();
  return query.length > 0 ? `/tasks/list?${query}` : '/tasks/list';
}

export function TaskList() {
  const router = useRouter();

  const [rows, setRows] = useState<TaskRow[]>([]);
  /*
   * `rows` starts empty, so until the first read answers, "no open tasks" is a sentence
   * this screen has no grounds for. `board` is what it does know: it is asking, it has an
   * answer, or it could not get one.
   */
  const [board, setBoard] = useState<'asking' | 'answered' | 'unreachable'>('asking');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ActiveClaim | null>(null);
  const [error, setError] = useState<{ task_id: string; message: string } | null>(null);
  /** The row whose relayed claim is in flight, so its button cannot be tapped twice. */
  const [claiming, setClaiming] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<number | null>(null);
  const [located, setLocated] = useState(false);
  const [hasFix, setHasFix] = useState(false);
  const [query, setQuery] = useState('');
  const [nearMe, setNearMe] = useState(false);
  /** Nominatim only — when the query already matches pins, `pinFocus` wins in the same frame. */
  const [geoFocus, setGeoFocus] = useState<GeocodeHit | null>(null);

  // The row the claim belongs to, kept so the pinned card still renders in the moment between
  // claiming and the next poll — and after the poll, if the API stops listing it.
  const claimedRow = useRef<TaskRow | null>(null);

  // Read through a ref so `poll` never changes identity: a new `poll` would tear down and
  // rebuild the interval on every render, and each rebuild is an extra request.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const stored = readActiveClaim();
    if (stored !== null) setClaim(stored);
  }, []);

  const locate = useCallback(async () => {
    await resolveArea();
    setHasFix(lastKnownPosition() !== null);
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await apiFetch<TasksResponse>(tasksPath());
      setRows(data.tasks);
      setBoard('answered');
      // `TaskCard` clears the stored claim when its countdown hits `00:00`; this is where the
      // pinned card goes away and the worker is back on the list.
      setClaim((current) => (current !== null && readActiveClaim() === null ? null : current));
      const recovered = recoverClaim(data.tasks);
      if (recovered !== null) {
        writeActiveClaim(recovered);
        setClaim(recovered);
      }
    } catch (thrown) {
      if (thrown instanceof ApiError && thrown.status === 401) routerRef.current.replace('/');
      // A later poll failing does not un-answer the list already on screen; only a board
      // that never got one goes to `unreachable`.
      else setBoard((current) => (current === 'asking' ? 'unreachable' : current));
    }
  }, []);

  const refresh = useCallback(async () => {
    await locate();
    await poll();
  }, [locate, poll]);

  useEffect(() => {
    let live = true;
    void locate().then(() => {
      if (live) setLocated(true);
    });
    return () => {
      live = false;
    };
  }, [locate]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length === 0) {
      setGeoFocus(null);
      return;
    }
    // Matching pins already frame the map; do not wait on Nominatim for those.
    const matched = rows.some(
      (row) =>
        rowMatchesQuery(row, query) &&
        row.coordinate_rounded !== undefined &&
        (!nearMe || (typeof row.distance_m === 'number' && row.distance_m <= NEAR_ME_M)),
    );
    if (matched) {
      setGeoFocus(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void geocodeAddress(needle).then((point) => {
        if (live) setGeoFocus(point);
      });
    }, GEOCODE_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, rows, nearMe]);

  useEffect(() => {
    if (!located) return;
    void poll();
    const id = setInterval(() => {
      if (document.hidden) return;
      void poll();
    }, POLL_MS);

    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [located, poll]);

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const data = await apiFetch<Earnings>('/me/earnings');
        if (live) setEarnings(data.released_usdc);
      } catch {
        // The footer is a readout, not a gate: a failed poll leaves the last figure alone.
      }
    };
    void read();
    const id = setInterval(() => void read(), EARNINGS_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const onClaim = useCallback(
    async (row: TaskRow) => {
      setError(null);
      setClaiming(row.task_id);
      try {
        const position = lastKnownPosition();
        const response = await apiFetch<ClaimResponse>(`/tasks/${row.task_id}/claim`, {
          method: 'POST',
          body: JSON.stringify(
            position === null ? {} : { lat: position.lat, lon: position.lon },
          ),
        });
        const next: ActiveClaim = {
          task_id: row.task_id,
          claim_expires_at: response.claim_expires_at,
          submit_deadline: response.submit_deadline,
          tx: response.tx,
        };
        writeActiveClaim(next);
        claimedRow.current = row;
        setClaim(next);
        setExpandedId(null);
      } catch (thrown) {
        const code = errorCode(thrown);
        setError({ task_id: row.task_id, message: claimErrorMessage(thrown) });
        // Someone was faster: the list is already wrong, so ask again rather than wait 3 s.
        if (code === 'AlreadyClaimed') void poll();
      } finally {
        setClaiming(null);
      }
    },
    [poll],
  );

  const onRelease = useCallback(
    async (task_id: string) => {
      setError(null);
      try {
        await apiFetch<{ tx: string }>(`/tasks/${task_id}/release-claim`, { method: 'POST' });
      } catch {
        // The claim is released locally either way: a claim the API no longer holds is not
        // one this screen should keep pinned.
        setError({ task_id, message: GENERIC_ERROR });
      }
      clearActiveClaim();
      claimedRow.current = null;
      setClaim(null);
      void poll();
    },
    [poll],
  );

  const canFilterNear = hasFix;
  const filtered = rows.filter((row) => {
    if (!rowMatchesQuery(row, query)) return false;
    if (!nearMe) return true;
    return typeof row.distance_m === 'number' && row.distance_m <= NEAR_ME_M;
  });

  const pinFocus = useMemo(() => {
    if (query.trim().length === 0) return null;
    return focusFromPoints(
      filtered
        .map((row) => row.coordinate_rounded)
        .filter((point): point is { lat: number; lon: number } => point !== undefined),
    );
  }, [filtered, query]);

  const searchFocus = pinFocus ?? geoFocus;

  const pinned =
    claim === null
      ? null
      : (filtered.find((row) => row.task_id === claim.task_id) ??
        rows.find((row) => row.task_id === claim.task_id) ??
        claimedRow.current);
  const rest = claim === null ? filtered : filtered.filter((row) => row.task_id !== claim.task_id);
  const searching = query.trim().length > 0 || nearMe;
  const emptyBoard = rest.length === 0 && claim === null && rows.length === 0 && board === 'answered';
  const emptySearch = rest.length === 0 && claim === null && rows.length > 0 && searching;

  return (
    <div data-screen="tasks">
      <p className="lw-list-label">{NEARBY_TASKS}</p>
      {located && !hasFix ? (
        <p className="lw-chips">
          <Chip tone="neutral" floor={20}>
            {GPS_UNAVAILABLE_CHIP}
          </Chip>
        </p>
      ) : null}

      <div className="lw-board-tools">
        <label className="lw-field" htmlFor="board-search">
          <span className="lw-list-label lw-list-label--flush">{SEARCH_LABEL}</span>
          <input
            className="lw-input lw-input--full"
            data-hit="44"
            data-search="board"
            id="board-search"
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            value={query}
          />
        </label>
        <button
          aria-checked={nearMe}
          className={nearMe ? 'lw-near-me lw-near-me--on' : 'lw-near-me'}
          data-hit="44"
          data-near="10km"
          disabled={!canFilterNear}
          onClick={() => setNearMe((current) => !current)}
          role="checkbox"
          type="button"
        >
          {NEAR_ME_LABEL}
        </button>
        {located && !hasFix ? (
          <p className="lw-note" data-floor="20" data-near="disabled-reason">
            {NEAR_ME_NEEDS_FIX}
          </p>
        ) : null}
      </div>

      <TaskMap
        fitWorker={query.trim().length === 0}
        focus={searchFocus}
        gpsUnavailableChip={GPS_UNAVAILABLE_CHIP}
        located={located}
        onSelect={setExpandedId}
        rows={filtered}
        selectedId={expandedId}
        worker={lastKnownPosition()}
      />

      <p className="lw-chips lw-chips--stacked">
        <button
          className="lw-plain-button lw-quiet-link"
          data-hit="44"
          data-refresh="list"
          onClick={() => void refresh()}
          type="button"
        >
          Refresh list
        </button>
      </p>

      {claim === null || pinned === null || pinned === undefined ? null : (
        <ul className="lw-list">
          <TaskCard
            claim={claim}
            error={error?.task_id === pinned.task_id ? error.message : undefined}
            expanded
            claiming={claiming === pinned.task_id}
            onClaim={() => void onClaim(pinned)}
            onRelease={() => void onRelease(pinned.task_id)}
            onToggle={() => setExpandedId(null)}
            row={pinned}
          />
        </ul>
      )}

      {board === 'asking' && rows.length === 0 && claim === null ? (
        <Waiting step="tasks">{LOOKING_FOR_TASKS}</Waiting>
      ) : null}

      {board === 'unreachable' && rows.length === 0 && claim === null ? (
        <p className="lw-body" data-board="unreachable" data-floor="20">
          {BOARD_UNREACHABLE}
        </p>
      ) : null}

      {emptyBoard ? (
        <div data-empty="tasks">
          <p className="lw-body" data-floor="20">
            {emptyBoardCopy()}
          </p>
        </div>
      ) : null}

      {emptySearch ? (
        <div data-empty="search">
          <p className="lw-body" data-floor="20">
            {emptySearchCopy()}
          </p>
        </div>
      ) : null}

      <ul className="lw-list">
        {rest.map((row) => (
          <TaskCard
            error={error?.task_id === row.task_id ? error.message : undefined}
            expanded={expandedId === row.task_id}
            key={row.task_id}
            claiming={claiming === row.task_id}
            onClaim={() => void onClaim(row)}
            onRelease={() => void onRelease(row.task_id)}
            onToggle={() => setExpandedId((current) => (current === row.task_id ? null : row.task_id))}
            row={row}
          />
        ))}
      </ul>

      {/* The bar is fixed to the viewport, so the last card needs the height back. */}
      <div aria-hidden="true" className="lw-earnings-bar__spacer" />
      <EarningsBar releasedUsdc={earnings} />
    </div>
  );
}
