'use client';

import type { TaskType } from '@legwork/shared';
import { openAuthModal } from './AuthModal';
import { Chip } from './ui/Chip';
import { MonoTag } from './ui/MonoTag';

/**
 * What a visitor sees on `/tasks` before they verify: the real list, at the real prices,
 * behind one banner. Nothing is blurred and nothing is invented — a stranger can read the
 * offer, decide it is worth a minute of World ID, and only then be asked for it.
 *
 * The component is pure props. It reads no session, fetches nothing and knows no route: the
 * caller (T-25's `app/tasks/page.tsx`) decides there is no session, hands over the open rows
 * of `GET /public/feed` with `amount_usdc` mapped to `price_usdc`, and mounts it first.
 *
 * The price shown is the worker's rate. The agent pays 3.45, escrow locks 3.45, the worker
 * receives the posted 3.00 and the 0.45 fee rides on top of it; the agent's price never
 * reaches the phone and nothing here subtracts anything from anything.
 */

export const VERIFY_HEADING = 'Verify to claim';
export const REAL_PRICES_LINE = 'real tasks, real prices — verification takes about a minute';
export const VERIFY_CTA = 'Login with World ID';
export const NO_OPEN_TASKS = 'no open tasks right now';

/** One open row of `GET /public/feed`, narrowed to what a locked list can honestly show. */
export type UnverifiedTask = {
  task_id: string;
  task_type: TaskType;
  title: string;
  price_usdc: number;
  /** Rule (9): a seeded row says so wherever it renders. The caller passes it through. */
  seeded?: boolean;
};

export type UnverifiedBannerProps = {
  tasks: UnverifiedTask[];
  /** Kept so existing callers still typecheck; the CTA opens the login modal. */
  verifyHref?: string;
};

export function UnverifiedBanner({ tasks }: UnverifiedBannerProps) {
  return (
    <div data-screen="unverified">
      <div className="lw-card lw-card--verified" data-banner="verify">
        <p className="lw-banner-heading" data-floor="20">
          {VERIFY_HEADING}
        </p>
        <p className="lw-body">{REAL_PRICES_LINE}</p>

        {/* A bare button with the `lw-button` classes — wrapping a `Button` would be two
            nested interactive elements over one 44 px target. */}
        <button
          className="lw-button lw-button--verified lw-button--full"
          data-cta="verify"
          data-hit="44"
          onClick={openAuthModal}
          type="button"
        >
          {VERIFY_CTA}
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="lw-body" data-empty="tasks">
          {NO_OPEN_TASKS}
        </p>
      ) : (
        <ul className="lw-list">
          {tasks.map((task) => (
            <li className="lw-card" data-task={task.task_id} key={task.task_id}>
              <p className="lw-chips lw-chips--stacked">
                <MonoTag>{task.task_type}</MonoTag>
                {task.seeded === true ? (
                  <Chip tone="seeded" floor={20}>
                    seeded
                  </Chip>
                ) : null}
              </p>

              <p className="lw-task-line">{task.title}</p>

              {/* One text node: the figure and its unit are read together on this screen. */}
              <p className="lw-price__figure lw-price__figure--locked" data-price={task.task_id}>
                {`${task.price_usdc.toFixed(2)} USDC`}
              </p>

              {/* Disabled, and said twice: `disabled` stops the tap, `aria-disabled` says why
                  out loud. The `Button` primitive is T-24's and takes no ARIA prop, so the
                  row uses its classes directly rather than restyling it — the same move
                  T-33's `Segmented` and `Back to tasks` make. */}
              <button
                aria-disabled="true"
                className="lw-button lw-button--ghost"
                data-hit="44"
                disabled
                type="button"
              >
                {VERIFY_HEADING}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
