import { Chip } from '../../../components/Chip';
import { Wordmark } from '../../../components/Wordmark';
import '../present.css';

/**
 * The stage, before the data.
 *
 * `/present` is the frame the video films, and on a reload it used to be a white document
 * for as long as `/public/*` and the subgraph took to answer. This is what it shows instead:
 * the ink ground, the real header, and the three columns in their real tracks, so the moment
 * the canvas arrives nothing on screen moves — the cards fill, they do not appear.
 *
 * Everything on it is true without reading anything. The wordmark, the two honesty chips and
 * the section labels are constants; `DEMO DATA` follows `DATA_MODE` exactly as the canvas
 * does. There is no clock, no numeral, no status badge and no meter fill, because inventing
 * one for a second would put a figure on the filmed surface that no source stands behind.
 */
export default function PresentLoading() {
  const demo = (process.env.DATA_MODE ?? 'demo') !== 'live';

  return (
    <div className="stage" data-stage="loading" role="status">
      <header className="present-header">
        <div className="present-header-top">
          <Wordmark className="present-wordmark" />
        </div>
        <div className="present-chips">
          {demo ? <Chip tone="demo">DEMO DATA</Chip> : null}
          <Chip tone="neutral">Base Sepolia · USDC</Chip>
          <Chip tone="neutral">testnet USDC — not spendable</Chip>
        </div>
      </header>

      <div className="present-columns">
        <div className="present-col present-col-left" data-column="left">
          <section className="card agent-card">
            <div className="section-label">agent</div>
          </section>
          <section className="card preflight">
            <div className="section-label">supply</div>
          </section>
        </div>

        <div className="present-col present-col-centre" data-column="centre">
          {/* The one waiting line, in the card the shot is built around. An empty escrow
              card on its own could be read as an escrow holding nothing. */}
          <section className="card meter meter-present">
            <div className="section-label">escrow</div>
            <p className="route-wait present-wait">
              <span className="route-wait-line">Reading the API and the subgraph…</span>
              <span aria-hidden="true" className="route-wait-track" />
            </p>
          </section>
          <div className="present-row" data-row="1">
            <div className="task-row" />
          </div>
        </div>

        <div className="present-col present-col-right" data-column="right">
          <section className="card screening">
            <div className="section-label">screening log</div>
          </section>
          <div className="present-row" data-row="2">
            <div className="task-row" />
          </div>
          <div className="present-row" data-row="3">
            <div className="task-row" />
          </div>
        </div>
      </div>
    </div>
  );
}
