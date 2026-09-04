import type { SessionState } from '../../lib/session';
import { Chip } from './Chip';

export type VerifiedChipProps = {
  state: SessionState;
  /** One line for the sticky header; the full banner is a paper card. */
  compact?: boolean;
  level: 'selfie' | 'orb';
};

/** The sandbox disclosure is part of the chip — a visible chip, never fine print. */
const SANDBOX_LABEL: Record<VerifiedChipProps['level'], string> = {
  selfie: 'sandbox Selfie Check',
  orb: 'sandbox World ID',
};

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
        Verified human ✓ · World ID · one account per person
      </span>
      <span>
        <Chip tone="verified" floor={20}>
          {SANDBOX_LABEL[level]}
        </Chip>
      </span>
    </div>
  );
}
