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
const MAX_ZOOM = 15;

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
  if (minLat === maxLat) {
    minLat -= 0.01;
    maxLat += 0.01;
  }
  if (minLon === maxLon) {
    minLon -= 0.01;
    maxLon += 0.01;
  }

  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const x0 = Math.floor(tileX(minLon, z));
    const x1 = Math.floor(tileX(maxLon, z));
    const y0 = Math.floor(tileY(maxLat, z));
    const y1 = Math.floor(tileY(minLat, z));
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols <= MAX_TILES && rows <= MAX_TILES && cols > 0 && rows > 0) {
      return { z, x0, y0, cols, rows };
    }
  }

  const z = MIN_ZOOM;
  const x0 = Math.floor(tileX(minLon, z));
  const y0 = Math.floor(tileY(maxLat, z));
  return { z, x0, y0, cols: MAX_TILES, rows: MAX_TILES };
}

export function pinPercent(point: LatLon, grid: TileGrid): { left: number; top: number } {
  const x = tileX(point.lon, grid.z);
  const y = tileY(point.lat, grid.z);
  return {
    left: ((x - grid.x0) / grid.cols) * 100,
    top: ((y - grid.y0) / grid.rows) * 100,
  };
}
