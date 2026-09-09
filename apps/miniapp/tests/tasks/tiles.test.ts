import { describe, expect, it } from 'vitest';
import { gridFor, pinPercent } from '../../lib/tiles';

const PRIMUSTAKE = { lat: 39.729, lon: -8.84 };
const JUNTA = { lat: 39.7295, lon: -8.8386 };
const LISBON = { lat: 38.7223, lon: -9.1393 };

describe('the tile grid', () => {
  it('gridIsAlwaysSquare', () => {
    // A phone gives the map one width and the tiles are `aspect-ratio: 1`, so an `n x m` grid
    // renders `m/n` screens tall. One task used to produce a tall strip whose pin sat off the
    // bottom of the viewport; square keeps the height equal to the width at every extent.
    for (const points of [[PRIMUSTAKE], [PRIMUSTAKE, JUNTA], [PRIMUSTAKE, LISBON]]) {
      const grid = gridFor(points)!;
      expect(grid, JSON.stringify(points)).not.toBeNull();
      expect(grid.cols, `cols vs rows for ${points.length} point(s)`).toBe(grid.rows);
      expect(grid.cols).toBeGreaterThan(0);
      expect(grid.cols).toBeLessThanOrEqual(4);
    }
  });

  it('everyPointLandsInsideTheGrid', () => {
    // A pin is positioned as a percentage of the grid, so a point outside 0..100 is a pin the
    // viewport never shows — which is what an off-centre grid did to a single task.
    for (const points of [[PRIMUSTAKE], [PRIMUSTAKE, JUNTA]]) {
      const grid = gridFor(points)!;
      for (const point of points) {
        const { left, top } = pinPercent(point, grid);
        expect(left, `left for ${JSON.stringify(point)}`).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThanOrEqual(100);
        expect(top, `top for ${JSON.stringify(point)}`).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThanOrEqual(100);
      }
    }
  });

  it('gridIsNullWithoutPoints', () => {
    expect(gridFor([])).toBeNull();
  });
});
