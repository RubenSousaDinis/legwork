/**
 * The in-UI glyph — DESIGN-SPEC "Iconography": no icon font, no emoji, no filled icon set.
 * A bare footprint, typed as two ellipses, always in the verified teal.
 *
 * It lives here rather than inside `layout.tsx` because the header is not the only place
 * the motif belongs: DESIGN-SPEC's route line is "request → route → proof", and the
 * released receipt is where a worker's route actually ends.
 */
export function Footprint({ size = 15 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="lw-footprint"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <ellipse cx="9" cy="9" rx="4.2" ry="6" transform="rotate(-14 9 9)" />
      <ellipse cx="15.5" cy="19" rx="2.6" ry="3.4" transform="rotate(-14 15.5 19)" />
    </svg>
  );
}
