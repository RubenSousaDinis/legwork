/**
 * Class L only: screen every catalog row through the live-fallback gate.
 *
 * Never imported by a test. Pauses ≥ 1 s between rows. Exit 1 if any row is not accepted.
 */
import {
  KeywordFallbackClassifier,
  createOverpassLookup,
  getPlaceIndex,
} from '@legwork/screening';
import { screenEnvelope } from '../services/hire';
import { areaOf, loadCatalog } from './catalog';

const ENDPOINT = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';
// Overpass fair use: ≥ 1 s between rows (brief). Two seconds keeps public mirrors happier.
const PAUSE_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const rows = loadCatalog();
  const places = getPlaceIndex();
  const classifier = new KeywordFallbackClassifier();
  const lookup = createOverpassLookup({
    endpoint: ENDPOINT,
    userAgent: 'legwork-seed-check/1.0 (+https://github.com/RubenSousaDinis/legwork)',
  });

  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const envelope = {
      task_type: row.task_type,
      amount_usdc: row.amount_usdc,
      spec: row.spec,
    };
    const verdict = await screenEnvelope(envelope, { places, classifier, lookup });

    let line: string;
    if (verdict.kind === 'accepted') {
      const expected = areaOf(row);
      if (row.exact && verdict.place) {
        const got = areaOf({
          ...row,
          exact: { lat: verdict.place.lat, lon: verdict.place.lon },
        });
        if (got !== expected) {
          line = `${row.id}  area-mismatch expected=${expected} got=${got}`;
          failed += 1;
        } else {
          line = `${row.id}  accepted`;
        }
      } else {
        line = `${row.id}  accepted`;
      }
    } else if (verdict.kind === 'invalid') {
      line = `${row.id}  invalid ${verdict.field} ${verdict.reason}`;
      failed += 1;
    } else if (verdict.kind === 'refused') {
      line = `${row.id}  refused ${verdict.class ?? 'null'}`;
      failed += 1;
    } else {
      line = `${row.id}  unavailable`;
      failed += 1;
    }
    console.log(line);

    if (i < rows.length - 1) await sleep(PAUSE_MS);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
