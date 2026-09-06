/**
 * The 9:16 crop band, in design pixels.
 *
 * The vertical cut of the demo video is taken out of the 16:9 footage, so only a 9:16
 * window of the stage survives. The band is `h * 9 / 16` wide and centred: x 656.25 to
 * 1263.75 at 1920x1080, x 437.5 to 842.5 at 1280x720.
 *
 * 607.5 is the band's **width** at 1080p, never an edge. This is the same math as
 * T-39's `e2e/lib/crop.ts`, mirrored here because the gate may not import from the app
 * and the rehearsal guide may not import from the gate.
 */

export interface CropBand {
  /** Left edge of the surviving column, in stage pixels. */
  left: number;
  /** Right edge of the surviving column, in stage pixels. */
  right: number;
  /** `h * 9 / 16` — the width of the column, never an edge. */
  width: number;
}

/** Anything with left and right edges: a `DOMRect`, a bounding box, a literal. */
export interface BandBox {
  left: number;
  right: number;
}

/** The centred 9:16 column of a `w x h` frame. */
export function nineSixteenBand(w: number, h: number): CropBand {
  const width = (h * 9) / 16;
  const left = (w - width) / 2;
  return { left, right: left + width, width };
}

/** True when the whole box survives the crop — both edges inside the band. */
export function insideBand(box: BandBox, band: CropBand): boolean {
  return box.left >= band.left && box.right <= band.right;
}
