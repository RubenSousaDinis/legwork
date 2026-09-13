import { describe, expect, it } from 'vitest';
import {
  USER_MAX_ZOOM,
  USER_MIN_ZOOM,
  centerKeepingFocus,
  gridAround,
  gridFor,
  pinPercent,
  pointFromPercent,
  zoomFromPinch,
} from '../../lib/tiles';

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

  it('cityBoundsStayBelowStreetZoom', () => {
    // Lisboa's Nominatim box. A single centroid at z16 is one street in Baixa;
    // the box has to pick a city zoom.
    const grid = gridFor(
      [
        { lat: 38.6913994, lon: -9.2298356 },
        { lat: 38.7967584, lon: -9.0863328 },
      ],
    )!;
    expect(grid.z).toBeLessThan(15);
    expect(grid.z).toBeGreaterThanOrEqual(10);
  });

  it('pinchZoomStepsAndKeepsTheFocalPoint', () => {
    expect(zoomFromPinch(12, 2)).toBe(13);
    expect(zoomFromPinch(12, 0.5)).toBe(11);
    expect(zoomFromPinch(USER_MIN_ZOOM, 0.1)).toBe(USER_MIN_ZOOM);
    expect(zoomFromPinch(USER_MAX_ZOOM, 8)).toBe(USER_MAX_ZOOM);

    const base = gridAround(PRIMUSTAKE, 14);
    const percent = { left: 30, top: 70 };
    const focal = pointFromPercent(percent, base);
    // Same zoom: percent round-trips exactly.
    expect(pinPercent(focal, base).left).toBeCloseTo(percent.left, 5);
    expect(pinPercent(focal, base).top).toBeCloseTo(percent.top, 5);

    const center = centerKeepingFocus(focal, percent, 15);
    const zoomed = gridAround(center, 15);
    const again = pinPercent(focal, zoomed);
    // Tile origins snap to integers, so a zoom step can drift by a fraction of a tile.
    expect(Math.abs(again.left - percent.left)).toBeLessThan(10);
    expect(Math.abs(again.top - percent.top)).toBeLessThan(10);
  });
});
