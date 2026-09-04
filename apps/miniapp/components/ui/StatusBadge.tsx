export type StatusBadgeStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'resolved'
  | 'refused'
  | 'locked';

export type StatusBadgeProps = {
  status: StatusBadgeStatus;
  size?: 'md' | 'sm';
};

/** Released is teal, refused amber, locked an ink outline, submitted a filled `--paper-100`. */
const TONE: Record<StatusBadgeStatus, string> = {
  open: '',
  claimed: '',
  submitted: 'lw-badge--submitted',
  released: 'lw-badge--released',
  refunded: '',
  disputed: '',
  resolved: '',
  refused: 'lw-badge--refused',
  locked: 'lw-badge--locked',
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const className = ['lw-badge', TONE[status], size === 'sm' ? 'lw-badge--sm' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} data-status={status}>
      {status}
    </span>
  );
}
