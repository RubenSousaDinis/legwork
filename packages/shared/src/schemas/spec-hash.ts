import stringify from 'fast-json-stable-stringify';
import { keccak256, toBytes } from 'viem';

/** Canonical JSON: sorted keys, no whitespace. The same bytes hash on the API, in MCP and in tests. */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

/** `keccak256(utf8(canonicalJson(spec)))` — the `specHash` that goes onchain in `PostParams`. */
export function specHash(spec: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(spec)));
}
