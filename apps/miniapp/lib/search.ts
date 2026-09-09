/**
 * Client-side board search. No fuzzy package: NFD-fold, lowercase, `includes`.
 */
export const NEAR_ME_M = 10_000;

export function foldSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

export type SearchableRow = {
  title: string;
  task_type: string;
  brief?: { place?: { name: string; street_address: string; locality: string } };
};

export function rowMatchesQuery(row: SearchableRow, query: string): boolean {
  const needle = foldSearch(query).trim();
  if (needle.length === 0) return true;
  const place = row.brief?.place;
  const haystack = [row.title, row.task_type, place?.name, place?.street_address, place?.locality]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  return foldSearch(haystack).includes(needle);
}
