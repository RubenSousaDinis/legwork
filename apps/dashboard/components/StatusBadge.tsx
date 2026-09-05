export type BadgeStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'resolved'
  | 'refused'
  | 'passed'
  | 'locked';

export interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'md' | 'sm';
  /**
   * The legibility floor in design px. T-39 measures declared attributes only, so a
   * badge the narration names has to say so — `TaskRow` passes 24. Screening-log
   * badges leave it unset; §7 does not list them.
   */
  floor?: 24 | 32;
}

export function StatusBadge({ status, size = 'md', floor }: StatusBadgeProps) {
  return (
    <span
      className={`badge badge-${status}${size === 'sm' ? ' badge-sm' : ''}`}
      data-status={status}
      {...(floor ? { 'data-floor': String(floor) } : {})}
    >
      {status}
    </span>
  );
}
