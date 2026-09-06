/**
 * Spike S3 — USDC balances for the buyer and for `payTo`, as 6-decimal integers.
 *
 * Run once before the paid call and once after. Expected deltas after one paid call:
 * buyer -3450000, payTo +3450000. Unchanged after the replay.
 */

import { createPublicClient, erc20Abi, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // already exported into the environment — fine
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

const USDC_ADDRESS = requireEnv("USDC_ADDRESS") as `0x${string}`;
const buyer = privateKeyToAccount(requireEnv("BUYER_PRIVATE_KEY") as `0x${string}`).address;
const payTo = privateKeyToAccount(requireEnv("RELAYER_PRIVATE_KEY") as `0x${string}`).address;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(requireEnv("BASE_SEPOLIA_RPC_URL")),
});

for (const [label, address] of [
  ["buyer", buyer],
  ["payTo", payTo],
] as const) {
  const units = await client.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  console.log(`${label} ${address} usdc_units=${units.toString()}`);
}
