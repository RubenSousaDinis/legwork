'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Chip } from './ui/Chip';
import { gridFor, osmTileUrl, pinPercent, type LatLon } from '../lib/tiles';

export const ODBL_LINE =
  'Place data © OpenStreetMap contributors, available under the Open Database License (ODbL)';

export const TILES_FAILED = 'Map tiles could not load.';
export const MAP_EMPTY = 'No locations to plot.';

/** Rows exist but none carries a coordinate — a silent empty map reads as a broken one. */
export const MAP_NO_COORDINATES = 'These tasks carry no map location yet.';

export type MapRow = {
  task_id: string;
  title: string;
  coordinate_rounded?: { lat: number; lon: number };
};

export type TaskMapProps = {
  rows: MapRow[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  worker: LatLon | null;
  gpsUnavailableChip: string;
  located: boolean;
  /**
   * A searched address. Frames the map when the query matched no pin, so typing a place the
   * board does not yet have still moves the tiles rather than leaving the old neighbourhood.
   */
  focus?: LatLon | null;
  /**
   * The worker pin still renders. This only decides whether they pull the tile grid — a
   * search has to be allowed to leave them off the edge, or the map never appears to move.
   */
  fitWorker?: boolean;
};

export function TaskMap({
  rows,
  selectedId,
  onSelect,
  worker,
  gpsUnavailableChip,
  located,
  focus = null,
  fitWorker = true,
}: TaskMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  const pins = rows.filter(
    (row): row is MapRow & { coordinate_rounded: { lat: number; lon: number } } =>
      row.coordinate_rounded !== undefined,
  );

  const pinKey = pins
    .map((row) => `${row.task_id}:${row.coordinate_rounded.lat},${row.coordinate_rounded.lon}`)
    .join('|');
  const focusKey = focus === null ? '' : `${focus.lat},${focus.lon}`;
  const workerKey =
    fitWorker && worker !== null ? `${worker.lat},${worker.lon}` : '';

  const grid = useMemo(() => {
    const next: LatLon[] = pins.map((row) => row.coordinate_rounded);
    if (next.length === 0 && focus !== null) next.push(focus);
    if (fitWorker && worker !== null) next.push(worker);
    return gridFor(next);
  }, [pinKey, focusKey, workerKey, fitWorker, pins, focus, worker]);

  const gridKey =
    grid === null ? '' : `${grid.z}/${grid.x0}/${grid.y0}/${grid.cols}x${grid.rows}`;

  useEffect(() => {
    setTilesFailed(false);
  }, [gridKey]);

  const tiles: { x: number; y: number }[] = [];
  if (grid !== null) {
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        tiles.push({ x: grid.x0 + x, y: grid.y0 + y });
      }
    }
  }

  return (
    <div className="lw-map" data-map="tasks">
      {grid !== null && !tilesFailed ? (
        <div
          className="lw-map__grid"
          key={gridKey}
          style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
        >
          {tiles.map((tile) => (
            <img
              alt=""
              className="lw-map__tile"
              data-tile={`${grid.z}/${tile.x}/${tile.y}`}
              key={`${grid.z}/${tile.x}/${tile.y}`}
              onError={() => setTilesFailed(true)}
              src={osmTileUrl(grid.z, tile.x, tile.y)}
            />
          ))}
        </div>
      ) : null}

      {tilesFailed ? (
        <p className="lw-body lw-map__fail" data-floor="20" data-map="tiles-failed">
          {TILES_FAILED}
        </p>
      ) : null}

      {grid === null && !tilesFailed ? (
        <p className="lw-body lw-map__empty" data-floor="20" data-map="empty">
          {rows.length > 0 && pins.length === 0 ? MAP_NO_COORDINATES : MAP_EMPTY}
        </p>
      ) : null}

      {located && worker === null ? (
        <p className="lw-chips">
          <Chip tone="neutral" floor={20}>
            {gpsUnavailableChip}
          </Chip>
        </p>
      ) : null}

      {grid !== null ? (
        <div className="lw-map__pins">
          {pins.map((row) => {
            const percent = pinPercent(row.coordinate_rounded, grid);
            const selected = selectedId === row.task_id;
            return (
              <button
                aria-label={row.title}
                className={
                  selected ? 'lw-map-pin lw-map-pin--selected' : 'lw-map-pin'
                }
                data-hit="44"
                data-pin="task"
                data-task={row.task_id}
                key={row.task_id}
                onClick={() => onSelect(row.task_id)}
                style={
                  {
                    '--pin-x': `${percent.left}%`,
                    '--pin-y': `${percent.top}%`,
                  } as CSSProperties
                }
                type="button"
              >
                <span className="lw-map-pin__mark" />
              </button>
            );
          })}
          {worker !== null ? (
            <span
              aria-label="You"
              className="lw-map-pin lw-map-pin--worker"
              data-pin="worker"
              style={
                {
                  '--pin-x': `${pinPercent(worker, grid).left}%`,
                  '--pin-y': `${pinPercent(worker, grid).top}%`,
                } as CSSProperties
              }
            >
              <span className="lw-map-pin__mark" />
            </span>
          ) : null}
          {focus !== null && pins.length === 0 ? (
            <span
              aria-label="Search"
              className="lw-map-pin lw-map-pin--focus"
              data-pin="search"
              style={
                {
                  '--pin-x': `${pinPercent(focus, grid).left}%`,
                  '--pin-y': `${pinPercent(focus, grid).top}%`,
                } as CSSProperties
              }
            >
              <span className="lw-map-pin__mark" />
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="lw-map__attr" data-map="odbl">
        {ODBL_LINE}
      </p>
    </div>
  );
}
