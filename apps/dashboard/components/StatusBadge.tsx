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
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={`badge badge-${status}${size === 'sm' ? ' badge-sm' : ''}`}
      data-status={status}
    >
      {status}
    </span>
  );
}
