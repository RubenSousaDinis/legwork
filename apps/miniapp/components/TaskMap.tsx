'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chip } from './ui/Chip';
import type { GeocodeHit } from '../lib/geocode';
import {
  USER_GRID_SIDE,
  centerKeepingFocus,
  gridAround,
  gridCenter,
  gridFor,
  osmTileUrl,
  panCenter,
  pinPercent,
  pointFromPercent,
  zoomFromPinch,
  type LatLon,
  type TileGrid,
} from '../lib/tiles';

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
   * A searched place. Its bounding box frames the map even when a matching pin exists —
   * otherwise "Lisboa" locks onto one street at z16.
   */
  focus?: GeocodeHit | null;
  /**
   * The worker pin still renders. This only decides whether they pull the tile grid — a
   * search has to be allowed to leave them off the edge, or the map never appears to move.
   */
  fitWorker?: boolean;
};

type UserView = { lat: number; lon: number; z: number };

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
  const [userView, setUserView] = useState<UserView | null>(null);
  const [pinch, setPinch] = useState<{ scale: number; x: string; y: string }>({
    scale: 1,
    x: '50%',
    y: '50%',
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<TileGrid | null>(null);
  const userViewRef = useRef<UserView | null>(null);
  userViewRef.current = userView;

  const pins = rows.filter(
    (row): row is MapRow & { coordinate_rounded: { lat: number; lon: number } } =>
      row.coordinate_rounded !== undefined,
  );

  const pinKey = pins
    .map((row) => `${row.task_id}:${row.coordinate_rounded.lat},${row.coordinate_rounded.lon}`)
    .join('|');
  const focusKey =
    focus === null
      ? ''
      : `${focus.lat},${focus.lon}:${focus.south},${focus.west},${focus.north},${focus.east}`;
  const workerKey =
    fitWorker && worker !== null ? `${worker.lat},${worker.lon}` : '';

  const fitted = useMemo(() => {
    const next: LatLon[] = pins.map((row) => row.coordinate_rounded);
    if (focus !== null) {
      next.push({ lat: focus.south, lon: focus.west }, { lat: focus.north, lon: focus.east });
    }
    if (fitWorker && worker !== null) next.push(worker);
    return gridFor(next, fitWorker ? undefined : { minSpanDeg: 0.04 });
  }, [pinKey, focusKey, workerKey, fitWorker, focus, worker, pins]);

  useEffect(() => {
    setUserView(null);
    setPinch({ scale: 1, x: '50%', y: '50%' });
  }, [pinKey, focusKey, fitWorker]);

  const grid =
    userView === null || fitted === null
      ? fitted
      : gridAround(userView, userView.z, USER_GRID_SIDE);
  gridRef.current = grid;

  const gridKey =
    grid === null ? '' : `${grid.z}/${grid.x0}/${grid.y0}/${grid.cols}x${grid.rows}`;

  useEffect(() => {
    setTilesFailed(false);
  }, [gridKey]);

  /*
   * Keep the last fully-loaded tile set on screen while the next grid fetches. Remounting
   * `<img>`s on every near-me / search left a blank map for a few hundred ms of OSM latency.
   * Depend on gridKey only — a new grid object with the same key must not restart the load.
   */
  const [painted, setPainted] = useState<TileGrid | null>(null);
  const [loading, setLoading] = useState<TileGrid | null>(null);
  const loadLeft = useRef(0);
  const loadGen = useRef(0);
  const paintedKeyRef = useRef('');
  const targetGridRef = useRef(grid);
  targetGridRef.current = grid;

  useEffect(() => {
    const target = targetGridRef.current;
    if (target === null || gridKey === '') {
      loadGen.current += 1;
      paintedKeyRef.current = '';
      setPainted(null);
      setLoading(null);
      loadLeft.current = 0;
      return;
    }
    if (paintedKeyRef.current === '' || paintedKeyRef.current === gridKey) {
      paintedKeyRef.current = gridKey;
      setPainted(target);
      setLoading(null);
      return;
    }
    const gen = ++loadGen.current;
    setLoading(target);
    loadLeft.current = target.cols * target.rows;
    const failSafe = window.setTimeout(() => {
      if (gen !== loadGen.current) return;
      paintedKeyRef.current = gridKey;
      setPainted(target);
      setLoading(null);
      loadLeft.current = 0;
    }, 450);
    return () => window.clearTimeout(failSafe);
  }, [gridKey]);

  const markTileReady = (gen: number, target: TileGrid, key: string) => {
    if (gen !== loadGen.current) return;
    if (loadLeft.current <= 0) return;
    loadLeft.current -= 1;
    if (loadLeft.current > 0) return;
    paintedKeyRef.current = key;
    setPainted(target);
    setLoading(null);
  };

  useEffect(() => {
    const el = mapRef.current;
    if (el === null) return;

    const pinchState = {
      startDist: 0,
      startZ: 0,
      liveScale: 1,
      focal: { lat: 0, lon: 0 } as LatLon,
      percent: { left: 50, top: 50 },
      active: false,
    };
    const panState = { x: 0, y: 0, active: false };

    const local = (touch: Touch) => {
      const rect = el.getBoundingClientRect();
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        w: rect.width,
        h: rect.height,
      };
    };

    const distance = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (event: TouchEvent) => {
      const current = gridRef.current;
      if (current === null) return;
      if (event.touches.length === 2) {
        event.preventDefault();
        panState.active = false;
        const a = event.touches[0]!;
        const b = event.touches[1]!;
        const rect = el.getBoundingClientRect();
        const percent = {
          left: rect.width === 0 ? 50 : ((a.clientX + b.clientX) / 2 - rect.left) / rect.width * 100,
          top: rect.height === 0 ? 50 : ((a.clientY + b.clientY) / 2 - rect.top) / rect.height * 100,
        };
        pinchState.active = true;
        pinchState.startDist = distance(a, b) || 1;
        pinchState.startZ = current.z;
        pinchState.liveScale = 1;
        pinchState.focal = pointFromPercent(percent, current);
        pinchState.percent = percent;
        setPinch({ scale: 1, x: `${percent.left}%`, y: `${percent.top}%` });
      } else if (event.touches.length === 1 && !pinchState.active) {
        const p = local(event.touches[0]!);
        panState.x = p.x;
        panState.y = p.y;
        panState.active = true;
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = gridRef.current;
      if (current === null) return;
      if (pinchState.active && event.touches.length === 2) {
        event.preventDefault();
        const scale = distance(event.touches[0]!, event.touches[1]!) / pinchState.startDist;
        pinchState.liveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
        setPinch((prev) => ({ ...prev, scale: pinchState.liveScale }));
        return;
      }
      if (panState.active && event.touches.length === 1) {
        const p = local(event.touches[0]!);
        const dx = p.x - panState.x;
        const dy = p.y - panState.y;
        if (Math.hypot(dx, dy) < 8 && userViewRef.current === null) return;
        event.preventDefault();
        panState.x = p.x;
        panState.y = p.y;
        const from = userViewRef.current ?? gridCenter(current);
        const next = panCenter(from, current, dx, dy, p.w, p.h);
        setUserView({ lat: next.lat, lon: next.lon, z: current.z });
      }
    };

    const endPinch = () => {
      if (!pinchState.active) return;
      const z = zoomFromPinch(pinchState.startZ, pinchState.liveScale);
      const center = centerKeepingFocus(pinchState.focal, pinchState.percent, z);
      setUserView({ lat: center.lat, lon: center.lon, z });
      setPinch({ scale: 1, x: '50%', y: '50%' });
      pinchState.active = false;
      panState.active = false;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinchState.active && event.touches.length < 2) endPinch();
      if (event.touches.length === 0) panState.active = false;
    };

    const onWheel = (event: WheelEvent) => {
      const current = gridRef.current;
      if (current === null) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const percent = {
        left: rect.width === 0 ? 50 : ((event.clientX - rect.left) / rect.width) * 100,
        top: rect.height === 0 ? 50 : ((event.clientY - rect.top) / rect.height) * 100,
      };
      const focal = pointFromPercent(percent, current);
      const z = zoomFromPinch(current.z, event.deltaY < 0 ? 2 : 0.5);
      if (z === current.z) return;
      const center = centerKeepingFocus(focal, percent, z);
      setUserView({ lat: center.lat, lon: center.lon, z });
    };

    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    el.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: false });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true });
      el.removeEventListener('touchmove', onTouchMove, { capture: true });
      el.removeEventListener('touchend', onTouchEnd, { capture: true });
      el.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const tilesFor = (g: TileGrid): { x: number; y: number }[] => {
    const next: { x: number; y: number }[] = [];
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        next.push({ x: g.x0 + x, y: g.y0 + y });
      }
    }
    return next;
  };

  const shown = painted ?? grid;
  const showTiles = shown !== null && !tilesFailed;

  const viewportStyle = {
    '--pinch-scale': String(pinch.scale),
    '--pinch-x': pinch.x,
    '--pinch-y': pinch.y,
  } as CSSProperties;

  const preloadGen = loadGen.current;

  return (
    <div
      className="lw-map"
      data-map="tasks"
      data-zoom={grid === null ? undefined : String(grid.z)}
      ref={mapRef}
    >
      {showTiles ? (
        <div className="lw-map__viewport" style={viewportStyle}>
          <div className="lw-map__stack">
            <div
              className="lw-map__grid"
              data-tiles="painted"
              style={{ gridTemplateColumns: `repeat(${shown.cols}, 1fr)` }}
            >
              {tilesFor(shown).map((tile) => (
                <img
                  alt=""
                  className="lw-map__tile"
                  data-tile={`${shown.z}/${tile.x}/${tile.y}`}
                  key={`p-${shown.z}/${tile.x}/${tile.y}`}
                  onError={() => setTilesFailed(true)}
                  src={osmTileUrl(shown.z, tile.x, tile.y)}
                />
              ))}
            </div>
            {loading !== null ? (
              <div
                aria-hidden="true"
                className="lw-map__grid lw-map__grid--preload"
                data-tiles="loading"
                style={{ gridTemplateColumns: `repeat(${loading.cols}, 1fr)` }}
              >
                {tilesFor(loading).map((tile) => (
                  <img
                    alt=""
                    className="lw-map__tile"
                    key={`l-${loading.z}/${tile.x}/${tile.y}`}
                    onError={() =>
                      markTileReady(
                        preloadGen,
                        loading,
                        `${loading.z}/${loading.x0}/${loading.y0}/${loading.cols}x${loading.rows}`,
                      )
                    }
                    onLoad={() =>
                      markTileReady(
                        preloadGen,
                        loading,
                        `${loading.z}/${loading.x0}/${loading.y0}/${loading.cols}x${loading.rows}`,
                      )
                    }
                    src={osmTileUrl(loading.z, tile.x, tile.y)}
                  />
                ))}
              </div>
            ) : null}
          </div>
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

      <p className="lw-map__attr" data-map="odbl">
        {ODBL_LINE}
      </p>
    </div>
  );
}
