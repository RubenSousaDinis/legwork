/**
 * Levenshtein distance, iterative two-row DP. Own implementation on purpose: the gate must
 * not grow a dependency for twenty lines of arithmetic (`fuzzyMatch` in `place-index.ts` is
 * the only caller, and it never sees a string longer than a place name).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const A = [...a];
  const B = [...b];
  let prev = new Array<number>(B.length + 1);
  let curr = new Array<number>(B.length + 1);
  for (let j = 0; j <= B.length; j++) prev[j] = j;

  for (let i = 1; i <= A.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[B.length] as number;
}
