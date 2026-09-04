// OWNER: T-16 — replace this file; do not edit from any other task
import { route } from '@/src/http/route';
import { ApiError } from '@/src/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => { throw new ApiError(501, 'not_implemented') })
