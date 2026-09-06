import { nineSixteenBand } from './crop';
import './present.css';

/** The stage is always authored at 1920x1080 and scaled by `--u`. */
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * A rehearsal aid, never in the filmed frame: `?crop=1` draws the two edges of the
 * 9:16 window the vertical cut keeps, so the operator can see on set whether the
 * escrow meter and row 1 are inside it. Hairline-1 on ink is deliberately faint —
 * it has to be visible to someone looking for it and invisible to a viewer.
 */
export function CropGuide() {
  const band = nineSixteenBand(STAGE_W, STAGE_H);
  const label = `9:16 band ${Math.round(band.left)}–${Math.round(band.right)}`;

  return (
    <div className="crop-guide" data-testid="crop-guide" aria-hidden="true">
      <div className="crop-guide-band">
        <span className="crop-guide-rule" style={{ left: `calc(${band.left} * var(--u))` }} />
        <span className="crop-guide-rule" style={{ left: `calc(${band.right} * var(--u))` }} />
        <span className="crop-guide-label" style={{ left: `calc(${band.left} * var(--u))` }}>
          {label}
        </span>
      </div>
    </div>
  );
}
