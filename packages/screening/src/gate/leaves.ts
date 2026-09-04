/** A string leaf of the raw spec, with the JSON path the gate reports as `field`. */
export type Leaf = { path: string; value: string };

/**
 * Every string leaf of `value`, in document order, pathed from `prefix` (`spec`). The gate
 * walks the envelope **as received** — before zod strips an unknown key — so a rule cannot be
 * dodged by hiding text in a field the schema does not know about.
 */
export function stringLeaves(value: unknown, prefix = 'spec'): Leaf[] {
  const out: Leaf[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      out.push({ path, value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}.${i}`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`);
    }
  };
  walk(value, prefix);
  return out;
}
