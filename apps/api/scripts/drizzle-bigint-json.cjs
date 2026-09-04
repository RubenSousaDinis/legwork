/**
 * Teaches `JSON.stringify` about BigInt, for drizzle-kit only.
 *
 * `src/db/schema.ts` is frozen (T-01) and declares `caps_ledger.daily_units` with
 * `.default(0n)`. drizzle-kit serialises every default into its snapshot with
 * `JSON.stringify`, which throws `TypeError: Do not know how to serialize a BigInt` and
 * takes `drizzle:generate` down with it — before it has written a single line of SQL.
 *
 * Preloading this makes the snapshot record `"0"` and the generated DDL read
 * `"daily_units" bigint DEFAULT 0 NOT NULL`, which is the column the schema asks for.
 *
 * The real fix belongs one line up, in the frozen file: `.default(sql`0`)` instead of
 * `.default(0n)`. Raised on the T-08 PR; delete this file and the `NODE_OPTIONS` prefix in
 * `drizzle:generate` when T-01 lands it.
 */
if (typeof BigInt.prototype.toJSON !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function toJSON() {
      return this.toString();
    },
    configurable: true,
    writable: true,
  });
}
