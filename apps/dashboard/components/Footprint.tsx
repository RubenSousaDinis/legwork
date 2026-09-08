/**
 * A bare footprint: a sole and a heel, two rounded shapes.
 * Nothing here is traced from the pre-kickoff pack.
 *
 * `currentColor` rather than a literal fill, so the colour is a CSS property the
 * `--meter-ms` transition can carry.
 */
export function Footprint({ dimmed }: { dimmed: boolean }) {
  return (
    <svg
      className="meter-footprint"
      viewBox="0 0 24 34"
      role="img"
      aria-label="proof"
      fill="currentColor"
      style={{ color: dimmed ? 'var(--fg-4)' : 'var(--verified-500)' }}
    >
      <path d="M7.4 2.2c6.2 0 10.4 4.2 10.4 10.1 0 5.3-3.4 8.6-6.9 8.6-3.9 0-6.1-3.6-6.1-8.7 0-3.9.2-7 1-9.2a1.7 1.7 0 0 1 1.6-.8z" />
      <ellipse cx="12.4" cy="28.4" rx="5.2" ry="3.9" />
    </svg>
  );
}
