import { PresentCanvas } from '../PresentCanvas';
import { getDashboardData, parseFeaturedState } from '../../../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

/** `/present` is the same canvas as `/?present=1`, with no query to remember on set. */
export default async function PresentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const data = getDashboardData(process.env.DATA_MODE, { ...(state ? { state } : {}) });
  return <PresentCanvas data={data} />;
}
