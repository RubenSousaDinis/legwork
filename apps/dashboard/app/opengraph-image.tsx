import { ImageResponse } from 'next/og';
import { getDashboardData } from '../lib/data';
import { usdc } from '../lib/format';

export const alt = 'Legwork — escrow meter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK_900 = '#0d0f0e';
const INK_800 = '#151816';
const BORDER_1 = '#262c28';
const FG_1 = '#f1efe9';
const FG_3 = '#8b918d';
const VERIFIED = '#35c79a';
const REFUSAL = '#e4a33f';

/*
 * The card is drawn with glyphs the bundled font already covers. `@vercel/og`
 * downloads a font for anything it does not, and this build must never reach the
 * network — so no check mark, no arrow, no math symbol below.
 */
/**
 * Every link unfurls with the escrow meter. `DATA_MODE` is read here on the server —
 * this route runs only on the server, so the mode never reaches a client bundle.
 */
export default async function OpengraphImage() {
  const data = getDashboardData(process.env.DATA_MODE);
  const featured = data.featured;
  const released = featured?.state === 'released' && featured.proofPresent;
  const stateWord = released
    ? 'RELEASED'
    : featured?.state === 'refunded'
      ? 'REFUNDED'
      : featured?.state === 'submitted'
        ? 'SUBMITTED'
        : 'LOCKED';
  const amount = usdc(
    released ? (featured?.workerReceives ?? 0) : (featured?.escrowLocked ?? 0),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK_900,
          padding: 64,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: 4, color: FG_1 }}>
            LEGWORK
          </div>
          {data.dataMode === 'demo' ? (
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                color: REFUSAL,
                border: `2px solid ${REFUSAL}`,
                borderRadius: 999,
                padding: '8px 24px',
              }}
            >
              DEMO DATA
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            background: INK_800,
            border: `2px solid ${BORDER_1}`,
            borderRadius: 16,
            padding: 40,
          }}
        >
          <div style={{ display: 'flex', fontSize: 24, color: FG_3, letterSpacing: 3 }}>ESCROW</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: released ? VERIFIED : FG_1 }}>
              {stateWord}
            </div>
            <div style={{ display: 'flex', fontSize: 110, fontWeight: 800, color: released ? VERIFIED : FG_1 }}>
              {amount}
            </div>
          </div>
          {released ? (
            <div style={{ display: 'flex', fontSize: 30, color: VERIFIED }}>
              to worker · +{usdc(featured?.fee ?? 0)} fee · proof on file
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: FG_3 }}>
          bounded, attributable work · Base Sepolia · USDC · testnet USDC — not spendable
        </div>
      </div>
    ),
    size,
  );
}
