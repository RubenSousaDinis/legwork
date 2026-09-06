import { CropGuide } from '../CropGuide';
import { PresentCanvas, type HideCard } from '../PresentCanvas';
import { loadDashboardData, parseFeaturedState } from '../../../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

/** The only names `?hide=` accepts. The meter and row 1 are not among them. */
const HIDE_CARDS: readonly HideCard[] = ['agent', 'supply', 'screening', 'row2', 'row3'];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `?hide=agent,supply` → the cards to cut. Anything unrecognised is ignored. */
function parseHideCards(value: string | string[] | undefined): HideCard[] {
  const raw = firstParam(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is HideCard => (HIDE_CARDS as readonly string[]).includes(name));
}

/**
 * `/present` is the same canvas as `/?present=1`, with no query to remember on set.
 *
 * `?task=<id>` pins the filmed task and is handed to both the loader and the canvas,
 * so T-26's 3-s poll follows the same task the server rendered. `?hide=` cuts cards,
 * `?state=` previews a meter beat in demo mode, and `?crop=1` draws the 9:16 band —
 * a rehearsal aid that is never in the filmed frame.
 */
export default async function PresentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const taskId = firstParam(sp.task);
  const hideCards = parseHideCards(sp.hide);
  const crop = firstParam(sp.crop) === '1';

  const data = await loadDashboardData(process.env.DATA_MODE, {
    ...(state ? { state } : {}),
    ...(taskId ? { taskId } : {}),
  });

  return (
    <>
      <PresentCanvas data={data} hideCards={hideCards} {...(taskId ? { taskId } : {})} />
      {crop ? <CropGuide /> : null}
    </>
  );
}
