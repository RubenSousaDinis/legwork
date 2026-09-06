/**
 * The 9:16 crop band.
 *
 * The vertical cut of the demo video is taken out of the 16:9 footage, so a 9:16
 * window of the stage survives and everything outside it is thrown away. The band is
 * `stageH * 9 / 16` wide and centred, which at 1920x1080 is x 656.25 to 1263.75.
 *
 * 607.5 is the band's **width**, not an edge. A gate written as "x between 607 and
 * 1313" is that width mistaken for a coordinate: it spans almost the whole stage and
 * passes layouts the crop cuts in half. The edges below are the gate.
 *
 * T-43 mirrors this math in `app/(present)/crop.ts` with the same numbers.
 */

export interface CropBand {
  /** Left edge of the surviving column, in stage pixels. */
  left: number;
  /** Right edge of the surviving column, in stage pixels. */
  right: number;
  /** `stageH * 9 / 16` — the width of the column, never an edge. */
  width: number;
}

/** Anything with left and right edges: a `DOMRect`, a Playwright bounding box, a literal. */
export interface BandBox {
  left: number;
  right: number;
}

/** The centred 9:16 column of a `stageW x stageH` frame. */
export function nineSixteenBand(stageW: number, stageH: number): CropBand {
  const width = (stageH * 9) / 16;
  const left = (stageW - width) / 2;
  return { left, right: left + width, width };
}

/** True when the whole box survives the crop — both edges inside the band. */
export function insideBand(box: BandBox, band: CropBand): boolean {
  return box.left >= band.left && box.right <= band.right;
}
