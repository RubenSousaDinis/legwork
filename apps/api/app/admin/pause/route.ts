// OWNER: T-19
/** Stop `post` and `claim`. Never `approve`, `autoRelease` or `expire`: a stop must not trap money. */
import { getChain } from '@/src/chain';
import { audited, ownerWrite, preflight } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = audited('/admin/pause', () => ownerWrite(() => getChain().pause()));

export const OPTIONS = preflight;
