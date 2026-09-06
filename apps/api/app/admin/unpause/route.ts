// OWNER: T-19
/** Start accepting posts and claims again. */
import { getChain } from '@/src/chain';
import { audited, ownerWrite, preflight } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = audited('/admin/unpause', () => ownerWrite(() => getChain().unpause()));

export const OPTIONS = preflight;
