'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Chip } from './ui/Chip';
import { gridFor, osmTileUrl, pinPercent, type LatLon } from '../lib/tiles';

export const ODBL_LINE =
  'Place data © OpenStreetMap contributors, available under the Open Database License (ODbL)';

export const TILES_FAILED = 'Map tiles could not load.';
export const MAP_EMPTY = 'No locations to plot.';

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
};

export function TaskMap({
  rows,
  selectedId,
  onSelect,
  worker,
  gpsUnavailableChip,
  located,
}: TaskMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  const pins = rows.filter(
    (row): row is MapRow & { coordinate_rounded: { lat: number; lon: number } } =>
      row.coordinate_rounded !== undefined,
  );

  const points = useMemo(() => {
    const next: LatLon[] = pins.map((row) => row.coordinate_rounded);
    if (worker !== null) next.push(worker);
    return next;
  }, [pins, worker]);

  const grid = useMemo(() => gridFor(points), [points]);

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
          {MAP_EMPTY}
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
        </div>
      ) : null}

      <p className="lw-map__attr" data-map="odbl">
        {ODBL_LINE}
      </p>
    </div>
  );
}
