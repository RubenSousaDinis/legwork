# Keys and roles

One job per key; never a personal key. Split four ways plus two, funded Sept 3. A dedicated hackathon keystore; never a personal key. Every key lives in Vercel env / the operator's `~/legwork.env`; cloud agents never see one.

| Role | Env var | Holds | Does | Never does | Public address (Base Sepolia) |
|---|---|---|---|---|---|
| Deployer / owner | `DEPLOYER_PRIVATE_KEY` | ETH for deploys; the seeded-lifecycle float | deploys; `seedWorker`, `resetWorker`, `resolve`, `pause`/`unpause`, `setAllowlistedBuyer`, `setMarkCooldown`, `registerIdentity` — **the disclosed operator powers in v0** | relay worker actions; sign attestations | `0x436cA2299e7fDF36C4b1164cA3e80081E68c318A` |
| Relayer | `RELAYER_PRIVATE_KEY` | ETH for gas; the USDC float that funds `post` between x402 settle and escrow | `post` from the float; `registerFor`, `claimFor`, `releaseClaimFor`, `submitFor`; `approve`/`dispute` on the buyer's behalf; x402 `payTo` | hold funds longer than one task; sign attestations or marks | `0x436cA2299e7fDF36C4b1164cA3e80081E68c318A` (same key as deployer, by operator choice — disclosed) |
| Attestation verifier | `ATTESTATION_VERIFIER_PRIVATE_KEY` | nothing onchain | signs the EIP-712 `Attestation` after IDKit cloud verification | send any transaction | same operator key as deployer/relayer today; `setAttestationVerifier` splits it without a redeploy |
| AbuseMark signer | `ABUSEMARK_SIGNER_PRIVATE_KEY` | ETH for gas | `AbuseMark.mark` only | anything else | onchain `AbuseMark.signer()` at [`0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608`](https://sepolia.basescan.org/address/0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608) — not in `contracts/deployments/base-sepolia.json` |
| Buyer (demo agent) | `BUYER_PRIVATE_KEY` | testnet USDC + ETH | pays x402 (local MCP, `demo:run`, `examples/agent.ts`); allowlisted so seeded workers may claim its tasks | run on Vercel; appear in a cloud agent's env | `0xc1286562DCD771eD76ED59e3D2A51DCe92d349d7` (ERC-8004 id **9196**) |
| CLI worker | `CLI_WORKER_PRIVATE_KEY` | nothing | the seeded worker of the headless loop (dev SIWE session; relayed routes) | be presented as a person | `0x7b4EB10df800881f73BC1d85BDeF02f82386271e` |
| Treasury | `TREASURY_ADDRESS` | fees | receives 0.45 per 3.00 task | — | `0xABFDB572E3d6093113Cdb9c1C1599E8699226D52` |

Onchain consequences: the four contracts read `relayer()`, `attestationVerifier()`, `signer()` and `owner()`; changing a key is one owner call each. `TxQueue` (`packages/chain`) is the only sender for the relayer and signer keys — many serverless invocations, one nonce sequence per key (Postgres advisory lock on the `nonces` row).

## Disclosed operator powers

Owner of the four contracts, all single-signer; multisig is roadmap.

| Power | What it does |
|---|---|
| `seedWorker` | Registers a worker row from a synthetic nullifier, flagged onchain as seeded |
| `resetWorker` | Clears a registration so the same World ID can register again |
| `resolve` | Sends a contested task's escrow to the buyer or the worker, zero fee either way |
| `pause` | Halts `post` and `claim`; release, dispute and expiry keep working |
| `setAllowlistedBuyer` | Marks a buyer whose tasks a seeded worker may claim |
| `setMarkCooldown` | Sets the minimum interval between two marks against one agent |

Today I am on both sides of this: my agent, my phone, my key resolves disputes. The contract doesn't know that, and that's the point of putting it in a contract.

Honesty lines that follow from this table (verbatim in README and narration): "cloud-verified, operator-attested — onchain World ID verification is Orb-only today" · "our custody is the one block between settlement and escrow, and we say so".

_checked against main on 2026-09-09_
