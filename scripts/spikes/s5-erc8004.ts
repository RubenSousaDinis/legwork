/**
 * Spike S5 — ERC-8004 round-trip against the deployed registries on Base Sepolia.
 *
 *   pnpm tsx scripts/spikes/s5-erc8004.ts
 *
 * Registers two throwaway identities A and B at the IdentityRegistry proxy, has B give
 * unsolicited feedback on A at the ReputationRegistry proxy, and reads it back with
 * `getSummary(agentIdA, [B], "paid-on-proof", "")` — the exact shape AbuseMark (T-13) will use.
 * Exits 0 only when that read comes back `count=1 summaryValue=1`.
 *
 * It then runs two `eth_call` simulations that spend no gas: whether the registry mints with
 * `_safeMint` (so a contract without `onERC721Received` cannot hold an agent id) and whether an
 * unregistered caller may give feedback. Both findings go into docs/spikes/RESULTS.md `## S5`.
 *
 * The throwaway keys are generated in memory for this run only and are never printed or written;
 * DEPLOYER_PRIVATE_KEY is read from the environment and funds them with 0.002 ETH each.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import identityRegistryAbiJson from '../../packages/shared/src/abi/erc8004/IdentityRegistry.json' with { type: 'json' };
import reputationRegistryAbiJson from '../../packages/shared/src/abi/erc8004/ReputationRegistry.json' with { type: 'json' };

const identityAbi = identityRegistryAbiJson as Abi;
const reputationAbi = reputationRegistryAbiJson as Abi;

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // already exported into the environment — fine
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env var ${name}`);
  return value;
}

const RPC_URL = requireEnv('BASE_SEPOLIA_RPC_URL');
const IDENTITY = requireEnv('ERC8004_IDENTITY_ADDRESS') as Address;
const REPUTATION = requireEnv('ERC8004_REPUTATION_ADDRESS') as Address;
const USDC = requireEnv('USDC_ADDRESS') as Address;

const FUNDING = parseEther('0.002');
const TAG1 = 'paid-on-proof';
const TAG2 = '';
const ZERO_HASH = `0x${'00'.repeat(32)}` as Hex;

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

const deployer = privateKeyToAccount(requireEnv('DEPLOYER_PRIVATE_KEY') as Hex);
const deployerWallet = createWalletClient({
  account: deployer,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

/** A, B and C exist only for this process. Nothing below ever logs a key. */
function throwaway() {
  const account = privateKeyToAccount(generatePrivateKey());
  return {
    account,
    address: account.address,
    wallet: createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) }),
  };
}

type Throwaway = ReturnType<typeof throwaway>;

const A = throwaway();
const B = throwaway();
const C = throwaway();

function txLink(hash: Hex): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

async function send(label: string, hash: Hex) {
  console.log(`${label} ${txLink(hash)}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${label} reverted (${hash})`);
  console.log(`${label} status=${receipt.status} gasUsed=${receipt.gasUsed}`);
  return receipt;
}

/**
 * A raw `eth_call` so a revert can be reported verbatim: the JSON-RPC error object as the node
 * returned it, plus the decoded error name when one of the two vendored ABIs recognises it.
 */
async function rawCall(args: {
  from: Address;
  to: Address;
  data: Hex;
}): Promise<
  { ok: true; data: Hex } | { ok: false; raw: unknown; revertData?: Hex; decoded?: string }
> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ from: args.from, to: args.to, data: args.data }, 'latest'],
    }),
  });
  const body = (await response.json()) as {
    result?: Hex;
    error?: { code?: number; message?: string; data?: unknown };
  };
  if (body.error === undefined && body.result !== undefined) return { ok: true, data: body.result };

  const candidate = body.error?.data;
  const revertData =
    typeof candidate === 'string' && candidate.startsWith('0x')
      ? (candidate as Hex)
      : typeof candidate === 'object' && candidate !== null && 'data' in candidate
        ? ((candidate as { data?: string }).data as Hex | undefined)
        : undefined;

  let decoded: string | undefined;
  if (revertData && revertData.length >= 10) {
    for (const abi of [identityAbi, reputationAbi]) {
      try {
        const error = decodeErrorResult({ abi, data: revertData });
        decoded = `${error.errorName}(${(error.args ?? []).join(', ')})`;
        break;
      } catch {
        // this ABI does not know the selector — try the other one
      }
    }
  }
  return {
    ok: false,
    raw: body.error,
    ...(revertData ? { revertData } : {}),
    ...(decoded ? { decoded } : {}),
  };
}

/**
 * The agent id comes from the `Registered` event in this transaction's own receipt, never from
 * the `simulateContract` return value: both simulations run against the same pre-state, so both
 * would predict the same id and the second registration would be reported under the first's.
 */
async function registerIdentity(who: 'A' | 'B', actor: Throwaway): Promise<bigint> {
  const agentURI = `https://legwork.example/spike/${who.toLowerCase()}`;
  const { request } = await publicClient.simulateContract({
    account: actor.account,
    address: IDENTITY,
    abi: identityAbi,
    functionName: 'register',
    args: [agentURI],
  });
  const hash = await actor.wallet.writeContract(request);
  const receipt = await send(`tx register(${who}) ${agentURI}`, hash);

  const [registered] = parseEventLogs({
    abi: identityAbi,
    eventName: 'Registered',
    logs: receipt.logs,
  });
  if (!registered) throw new Error(`register(${who}) emitted no Registered event (${hash})`);
  return (registered.args as { agentId: bigint }).agentId;
}

/**
 * The registry write is confirmed but the node answering reads may still be a block behind, so a
 * summary read taken straight after the receipt can come back empty. Poll rather than assert once.
 */
async function readSummary(
  agentId: bigint,
  client: Address,
): Promise<readonly [bigint, bigint, number]> {
  let last: readonly [bigint, bigint, number] = [0n, 0n, 0];
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    last = (await publicClient.readContract({
      address: REPUTATION,
      abi: reputationAbi,
      functionName: 'getSummary',
      args: [agentId, [client], TAG1, TAG2],
    })) as readonly [bigint, bigint, number];
    if (last[0] > 0n) {
      if (attempt > 1) console.log(`getSummary settled on attempt ${attempt}`);
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return last;
}

async function main(): Promise<void> {
  console.log(`chain           ${baseSepolia.name} (${baseSepolia.id})`);
  console.log(`identity proxy  ${IDENTITY}`);
  console.log(`reputation proxy ${REPUTATION}`);
  console.log(
    `funder          ${deployer.address} balance=${formatEther(await publicClient.getBalance({ address: deployer.address }))} ETH`,
  );
  console.log(`throwaway A     ${A.address}`);
  console.log(`throwaway B     ${B.address}`);
  console.log(`throwaway C     ${C.address} (never registered, simulation only)`);
  console.log('');

  // --- fund A and B -------------------------------------------------------------------------
  for (const [who, actor] of [
    ['A', A],
    ['B', B],
  ] as const) {
    const hash = await deployerWallet.sendTransaction({ to: actor.address, value: FUNDING });
    await send(`tx fund(${who}) 0.002 ETH`, hash);
  }
  console.log('');

  // --- register A and B ---------------------------------------------------------------------
  const agentIdA = await registerIdentity('A', A);
  const agentIdB = await registerIdentity('B', B);
  console.log('');
  console.log(`agentIdA        ${agentIdA}`);
  console.log(`agentIdB        ${agentIdB}`);

  const ownerA = (await publicClient.readContract({
    address: IDENTITY,
    abi: identityAbi,
    functionName: 'ownerOf',
    args: [agentIdA],
  })) as Address;
  const walletA = (await publicClient.readContract({
    address: IDENTITY,
    abi: identityAbi,
    functionName: 'getAgentWallet',
    args: [agentIdA],
  })) as Address;
  const ownerMatches = ownerA.toLowerCase() === A.address.toLowerCase();
  console.log(`ownerOf(agentIdA)        ${ownerA} == A -> ${ownerMatches}`);
  console.log(`getAgentWallet(agentIdA) ${walletA}`);
  console.log('');

  // --- unsolicited feedback from B on A -----------------------------------------------------
  const feedbackArgs = [agentIdA, 1n, 0, TAG1, TAG2, '', '', ZERO_HASH] as const;
  const { request: feedbackRequest } = await publicClient.simulateContract({
    account: B.account,
    address: REPUTATION,
    abi: reputationAbi,
    functionName: 'giveFeedback',
    args: feedbackArgs,
  });
  const feedbackHash = await B.wallet.writeContract(feedbackRequest);
  await send('tx giveFeedback(B -> agentIdA, value=1, tag1=paid-on-proof)', feedbackHash);
  console.log('');

  // --- read it back, scoped to B as the only client -----------------------------------------
  // `clients` is [B] deliberately: an empty array is not a wildcard here, it reverts with
  // "clientAddresses required", and a wider list would let another rater's feedback stand in
  // for the one this spike just wrote.
  const [count, summaryValue, summaryValueDecimals] = await readSummary(agentIdA, B.address);
  console.log(
    `getSummary(agentIdA, [B], "${TAG1}", "") -> count=${count} summaryValue=${summaryValue} summaryValueDecimals=${summaryValueDecimals}`,
  );
  console.log('');

  // --- simulation (a): does register mint with _safeMint or _mint? ---------------------------
  console.log('--- simulations (eth_call, no gas spent) ---');
  const mintProbe = await rawCall({
    from: USDC,
    to: IDENTITY,
    data: encodeFunctionData({ abi: identityAbi, functionName: 'register', args: ['probe'] }),
  });
  let mintMode: string;
  if (mintProbe.ok) {
    mintMode = '_mint';
    console.log(
      `(a) register("probe") from USDC ${USDC} (code, no onERC721Received) -> ok ${mintProbe.data}`,
    );
  } else {
    mintMode = '_safeMint';
    console.log(`(a) register("probe") from USDC ${USDC} (code, no onERC721Received) -> revert`);
    console.log(`    raw     ${JSON.stringify(mintProbe.raw)}`);
    console.log(`    data    ${mintProbe.revertData ?? '(none returned)'}`);
    console.log(`    decoded ${mintProbe.decoded ?? '(selector unknown to the vendored ABIs)'}`);
  }
  console.log(`mint mode: ${mintMode}`);
  console.log('');

  // --- simulation (b): may a never-registered caller give feedback? --------------------------
  const unregisteredProbe = await rawCall({
    from: C.address,
    to: REPUTATION,
    data: encodeFunctionData({
      abi: reputationAbi,
      functionName: 'giveFeedback',
      args: [...feedbackArgs],
    }),
  });
  let unregistered: string;
  if (unregisteredProbe.ok) {
    unregistered = 'allowed';
    console.log(`(b) giveFeedback from never-registered C ${C.address} -> ok`);
  } else {
    unregistered = `reverts ${unregisteredProbe.decoded ?? unregisteredProbe.revertData ?? 'unknown'}`;
    console.log(`(b) giveFeedback from never-registered C ${C.address} -> revert`);
    console.log(`    raw     ${JSON.stringify(unregisteredProbe.raw)}`);
    console.log(`    data    ${unregisteredProbe.revertData ?? '(none returned)'}`);
    console.log(
      `    decoded ${unregisteredProbe.decoded ?? '(selector unknown to the vendored ABIs)'}`,
    );
  }
  console.log(`unregistered caller: ${unregistered}`);
  console.log('');

  const pass = count === 1n && summaryValue === 1n && ownerMatches;
  console.log(pass ? 'S5: PASS' : 'S5: FAIL');
  if (!pass) {
    throw new Error(
      `expected ownerOf(agentIdA)==A and count=1 summaryValue=1; got owner match=${ownerMatches} count=${count} summaryValue=${summaryValue}`,
    );
  }
}

await main();
