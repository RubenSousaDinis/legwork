import { z } from 'zod';

/** An OpenStreetMap id. The only accepted key for a place; Google ids are stored aliases. */
export const OSM_PLACE_ID = /^(node|way|relation)\/\d+$/;

/**
 * Where a task happens. `place_id` must resolve to an OpenStreetMap object with a business tag —
 * the gate (T-06) enforces both; this schema only checks shape.
 */
export const Place = z.object({
  place_id: z.string().regex(OSM_PLACE_ID, 'an OpenStreetMap id: node/…, way/… or relation/…'),
  google_place_id: z.string().max(128).optional(),
  name: z.string().min(1).max(120),
  street_address: z.string().min(1).max(160),
  locality: z.string().min(1).max(80),
  /** Any country. The packaged OSM extract covers Leiria and Lisbon offline; every other `place_id` resolves live at `/check` and `/tasks` (T-61, T-62). */
  country: z.string().regex(/^[A-Z]{2}$/, 'ISO-3166-1 alpha-2'),
});
export type Place = z.infer<typeof Place>;
