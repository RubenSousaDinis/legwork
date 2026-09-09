/**
 * Slippy-map math for OpenStreetMap raster tiles. No map library: tiles are `<img>`
 * elements and pins are placed as percentages over the grid.
 */

export type LatLon = { lat: number; lon: number };

export type TileGrid = {
  z: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
};

export function tileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function osmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

const MAX_TILES = 4;
const MIN_ZOOM = 10;
/*
 * z16 is ~610 m of tile at this latitude. The board's tasks are normally a neighbourhood
 * apart — the three open in Parceiros span 350 m — and at z15 a whole neighbourhood fell
 * inside one tile, so the pins landed in a corner of a 2.4 km map. Not higher: at z18 the
 * same three put a pin at 95% of the width, and a 44 px pin there hangs off the edge.
 */
const MAX_ZOOM = 16;

export function gridFor(points: LatLon[]): TileGrid | null {
  if (points.length === 0) return null;

  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;
  let minLon = points[0]!.lon;
  let maxLon = points[0]!.lon;
  for (const point of points) {
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
    if (point.lon < minLon) minLon = point.lon;
    if (point.lon > maxLon) maxLon = point.lon;
  }

  /*
   * The grid is always square. A phone gives the map one width and the tiles are
   * `aspect-ratio: 1`, so an `n x m` grid renders `m/n` screens tall — a single task with a
   * 1x3 grid was three viewports of map with the pin somewhere off the bottom. Square keeps
   * the height equal to the width whatever the extent, and the viewport can then be capped
   * in CSS without the pin percentages lying.
   */
  const centreLat = (minLat + maxLat) / 2;
  const centreLon = (minLon + maxLon) / 2;

  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const spanX = tileX(maxLon, z) - tileX(minLon, z);
    const spanY = tileY(minLat, z) - tileY(maxLat, z);
    const side = Math.max(1, Math.ceil(Math.max(spanX, spanY)) + 1);
    if (side <= MAX_TILES) return squareAround(centreLat, centreLon, z, side);
  }
  return squareAround(centreLat, centreLon, MIN_ZOOM, MAX_TILES);
}

/**
 * `side x side` tiles centred on a point, so the extent sits in the middle rather than a corner.
 *
 * `round`, not `floor`: flooring the half-side offset drops the origin a whole tile too far
 * whenever the centre sits in the first half of its tile, which puts the point past the right
 * edge — a single task pinned at 136% and therefore off the map. `everyPointLandsInsideTheGrid`
 * is the guard.
 */
function squareAround(lat: number, lon: number, z: number, side: number): TileGrid {
  const x0 = Math.round(tileX(lon, z) - side / 2);
  const y0 = Math.round(tileY(lat, z) - side / 2);
  return { z, x0, y0, cols: side, rows: side };
}

/** Where a point sits inside the grid, as a percentage of its width and height. */
export function pinPercent(point: LatLon, grid: TileGrid): { left: number; top: number } {
  const x = tileX(point.lon, grid.z);
  const y = tileY(point.lat, grid.z);
  return {
    left: ((x - grid.x0) / grid.cols) * 100,
    top: ((y - grid.y0) / grid.rows) * 100,
  };
}
