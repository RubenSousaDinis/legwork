/**
 * Writes `packages/screening/fixtures/osm/leiria-lisbon.json.gz`.
 *
 * The only file in T-22 that touches the network. Nothing under `packages/screening/src` or
 * `packages/screening/test` opens a socket: the gate reads the cached extract this script
 * produces, and there is no live geocoder on any path a demo runs through.
 *
 *   pnpm osm:extract        (or: pnpm tsx scripts/osm-extract.ts)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildExtract, serializeExtract } from '../packages/screening/src/osm/buildExtract.ts';

/** The whole covered region, `S,W,N,E`. Hard-coded here and nowhere else — that is the point. */
const BBOXES = [
  { name: 'Leiria', bbox: '39.68,-8.90,39.82,-8.70' },
  { name: 'Lisbon', bbox: '38.68,-9.25,38.83,-9.08' },
] as const;

const ENDPOINT = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';

/** Above this the file is not written at all: tighten a bounding box instead. */
export const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;

/** The usage policy asks for a descriptive client string; an anonymous one is refused. */
const USER_AGENT = 'legwork-osm-extract/1.0 (screening place index; Leiria+Lisbon)';

const ATTEMPT_BACKOFF_MS = [5_000, 15_000];
const BETWEEN_BOXES_MS = 5_000;

const OUT = fileURLToPath(
  new URL('../packages/screening/fixtures/osm/leiria-lisbon.json.gz', import.meta.url),
);

type ApiResponse = { elements: unknown[]; osm3s?: { timestamp_osm_base?: string } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Business tags only. Never widen this to residential buildings: a copy of every home in
 * Lisbon is not something this project stores, and it would blow the 5 MB budget anyway. An
 * id that is not in the extract resolves to nothing and is refused as `region not covered` —
 * refuse-by-default is the correct outcome.
 *
 * The six selectors are wrapped in a union so that one `out center tags;` emits all of them;
 * without it each statement would overwrite the previous result set and only the last would
 * be written out.
 */
const query = (bbox: string) => `[out:json][timeout:180];
(
  nwr["shop"](${bbox});
  nwr["amenity"](${bbox});
  nwr["office"](${bbox});
  nwr["craft"](${bbox});
  nwr["healthcare"](${bbox});
  nwr["tourism"](${bbox});
);
out center tags;`;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

async function fetchBox(name: string, bbox: string): Promise<ApiResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const wait = ATTEMPT_BACKOFF_MS[attempt - 1] ?? 15_000;
      console.error(`${name}: attempt ${attempt} failed, retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          // The endpoint answers 406 to an anonymous client, and the OSM usage policy asks
          // callers to identify themselves.
          'user-agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query(bbox) }),
      });
      if (res.status !== 200) {
        console.error(`${name}: HTTP ${res.status} from ${ENDPOINT}`);
        continue;
      }
      const body = (await res.json()) as ApiResponse;
      if (!Array.isArray(body.elements) || body.elements.length === 0) {
        console.error(`${name}: empty elements array from ${ENDPOINT}`);
        continue;
      }
      console.log(`${name}: ${body.elements.length} elements`);
      return body;
    } catch (err) {
      console.error(`${name}: ${err instanceof Error ? err.message : String(err)} (${ENDPOINT})`);
    }
  }
  return die(`${name}: no usable response from ${ENDPOINT} after 3 attempts — nothing written`);
}

async function main(): Promise<void> {
  const responses: ApiResponse[] = [];
  for (const [i, box] of BBOXES.entries()) {
    if (i > 0) await sleep(BETWEEN_BOXES_MS);
    responses.push(await fetchBox(box.name, box.bbox));
  }

  // The older of the two source timestamps: the instant both halves are known good, and a
  // value that comes from the data rather than from this machine's clock.
  const timestamps = responses
    .map((r) => r.osm3s?.timestamp_osm_base)
    .filter((t): t is string => typeof t === 'string')
    .sort();

  const extract = buildExtract({
    elements: responses.flatMap((r) => r.elements),
    ...(timestamps[0] ? { osm3s: { timestamp_osm_base: timestamps[0] } } : {}),
  });

  const json = serializeExtract(extract);
  const raw = Buffer.byteLength(json, 'utf8');
  const gz = gzipSync(json, { level: 9 });

  console.log(`pois: ${extract.pois.length}`);
  console.log(`generated_at: ${extract.generated_at}`);
  console.log(`uncompressed bytes: ${raw}`);
  console.log(`gzipped bytes: ${gz.byteLength}`);

  if (gz.byteLength > MAX_EXTRACT_BYTES) {
    die(
      `gzipped extract is ${gz.byteLength} bytes, over the ${MAX_EXTRACT_BYTES}-byte budget — ` +
        'nothing written. Tighten one of the two bounding boxes in this script and re-run.',
    );
  }

  writeFileSync(OUT, gz);
  console.log(`wrote ${OUT}`);
}

await main();
