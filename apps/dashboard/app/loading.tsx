import { Wordmark } from '../components/Wordmark';

/**
 * What every dynamic route shows while its data is read.
 *
 * `/`, `/live`, `/refusals` and `/task/[id]` are server-rendered on demand and each of them
 * awaits `/public/*` plus a subgraph round trip before a byte reaches the browser. Without a
 * `loading.tsx` in the segment that wait is a white document; with one, Next streams the ink
 * ground and the wordmark in the first frame and fills the page in behind it.
 *
 * There is no number on it, and no card pretending to be a card. `/present` has its own,
 * because the filmed canvas has geometry to hold.
 */
export default function Loading() {
  return (
    <div className="route-loading" role="status">
      <Wordmark />
      <p className="route-wait">
        <span className="route-wait-line">Reading the API and the subgraph…</span>
        <span aria-hidden="true" className="route-wait-track" />
      </p>
    </div>
  );
}
