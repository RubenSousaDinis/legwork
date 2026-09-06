import { expect, test } from '@playwright/test';
import { insideBand, nineSixteenBand } from './lib/crop';

/**
 * Pure math, no fixtures: the test function takes no arguments, so Playwright opens
 * no browser for it. Fast feedback on the one number the rest of the gate rests on.
 */
test('cropBandMath', () => {
  const band1080 = nineSixteenBand(1920, 1080);
  expect(band1080).toEqual({ left: 656.25, right: 1263.75, width: 607.5 });

  const band720 = nineSixteenBand(1280, 720);
  expect(band720).toEqual({ left: 437.5, right: 842.5, width: 405 });

  // T-10's centre column, x 680 to 1240: inside the band, so it survives the crop.
  expect(insideBand({ left: 680, right: 1240 }, band1080)).toBe(true);

  // 607.5 is the band's width. Read as a pair of edges it spans nearly the whole
  // stage, and a box that wide is cut in half by the crop.
  expect(insideBand({ left: 607, right: 1313 }, band1080)).toBe(false);
});
