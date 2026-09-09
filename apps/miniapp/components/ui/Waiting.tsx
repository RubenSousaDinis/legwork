import type { ReactNode } from 'react';

export type WaitingProps = {
  /** What is being waited on, in the interface's own words. A sentence, not a noun. */
  children: ReactNode;
  /** The `data-waiting` value a test or the operator reads: which wait this is. */
  step?: string;
};

/**
 * The phone's one waiting state.
 *
 * DESIGN-SPEC "The idea": the route line is "a dot, a dashed path, a footprint at the end",
 * and it "appears as dividers, progress bars and the escrow meter". This is the progress
 * bar. The dash travels because the route is still being walked, and there is no footprint
 * at the end of it — the receipt's route has one, and that is the difference between on the
 * way and arrived.
 *
 * It says what is being waited on rather than spinning: a worker standing in a doorway with
 * a photo half-uploaded needs to know which half. `prefers-reduced-motion` holds the dash
 * still and the sentence is what carries the state, which is the arrangement either way for
 * anyone reading it through `role="status"`.
 */
export function Waiting({ children, step }: WaitingProps) {
  return (
    <p
      className="lw-waiting"
      data-floor="20"
      {...(step ? { 'data-waiting': step } : { 'data-waiting': 'true' })}
      role="status"
    >
      <span className="lw-waiting__line">{children}</span>
      <span aria-hidden="true" className="lw-waiting__route" />
    </p>
  );
}
