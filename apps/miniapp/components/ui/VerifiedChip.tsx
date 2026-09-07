import type { SessionState } from '../../lib/session';
import { Chip } from './Chip';

export type VerifiedChipProps = {
  state: SessionState;
  /** One line for a page header; the full banner is the sticky header's second row. */
  compact?: boolean;
  level: 'selfie' | 'orb';
};

/** The sandbox disclosure is part of the chip — a visible chip, never fine print. */
const SANDBOX_LABEL: Record<VerifiedChipProps['level'], string> = {
  selfie: 'sandbox Selfie Check',
  orb: 'sandbox World ID',
};

/**
 * The claim and the clause behind it, as one sentence.
 *
 * `Verified human ✓ · World ID · one account per person` is a single inline run so the text
 * stays exactly that sentence for anything reading it, and the phone wraps it into the
 * prototype's two lines on its own. The sizes are the floors rather than the prototype's
 * 17/15: the run carries `data-floor="20"`, and Inter body never renders below 16 px.
 */
export function VerifiedChip({ state, compact = false, level }: VerifiedChipProps) {
  if (state.status !== 'verified') {
    return (
      <span className="lw-verified-compact" data-verified="false">
        <Chip tone="neutral" floor={20}>
          Verify to claim
        </Chip>
      </span>
    );
  }

  if (compact) {
    return (
      <span className="lw-verified-compact" data-verified="true">
        <Chip tone="verified" floor={20}>
          Verified human ✓ · sandbox
        </Chip>
      </span>
    );
  }

  return (
    <div className="lw-verified-banner" data-verified="true">
      <span className="lw-verified-line" data-floor="20">
        <span className="lw-verified-line__head">Verified human ✓</span>
        <span className="lw-verified-line__sub"> · World ID · one account per person</span>
      </span>
      <span>
        <Chip tone="verified" floor={20}>
          {SANDBOX_LABEL[level]}
        </Chip>
      </span>
    </div>
  );
}
