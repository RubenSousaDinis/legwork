import { z } from 'zod';

/** An OpenStreetMap id. The only accepted key for a place; Google ids are stored aliases. */
export const OSM_PLACE_ID = /^(node|way|relation)\/\d+$/;

/**
 * Where a task happens. `place_id` must resolve in the cached OSM extract (T-22) and carry a
 * business tag — the gate (T-06) enforces both; this schema only checks shape.
 */
export const Place = z.object({
  place_id: z.string().regex(OSM_PLACE_ID, 'an OpenStreetMap id: node/…, way/… or relation/…'),
  google_place_id: z.string().max(128).optional(),
  name: z.string().min(1).max(120),
  street_address: z.string().min(1).max(160),
  locality: z.string().min(1).max(80),
  country: z.literal('PT'),
});
export type Place = z.infer<typeof Place>;
