# Keys and roles

Split four ways plus two, funded Sept 3 (07-pre-kickoff item 2). One job per key. A dedicated hackathon keystore; never a personal key. Every key lives in Vercel env / the operator's `~/legwork.env`; cloud agents never see one.

| Role | Env var | Holds | Does | Never does |
|---|---|---|---|---|
| Deployer / owner | `DEPLOYER_PRIVATE_KEY` | ETH for deploys; the seeded-lifecycle float | deploys; `seedWorker`, `resetWorker`, `resolve`, `pause`/`unpause`, `setAllowlistedBuyer`, `setMarkCooldown`, `registerIdentity` — **the disclosed operator powers in v0** | relay worker actions; sign attestations |
| Relayer | `RELAYER_PRIVATE_KEY` | ETH for gas; the USDC float that funds `post` between x402 settle and escrow | `post` from the float; `registerFor`, `claimFor`, `releaseClaimFor`, `submitFor`; `approve`/`dispute` on the buyer's behalf; x402 `payTo` | hold funds longer than one task; sign attestations or marks |
| Attestation verifier | `ATTESTATION_VERIFIER_PRIVATE_KEY` | nothing onchain | signs the EIP-712 `Attestation` after IDKit cloud verification | send any transaction |
| AbuseMark signer | `ABUSEMARK_SIGNER_PRIVATE_KEY` | ETH for gas | `AbuseMark.mark` | anything else |
| Buyer (demo agent) | `BUYER_PRIVATE_KEY` | testnet USDC + ETH | pays x402 (local MCP, `demo:run`, `examples/agent.ts`); allowlisted so seeded workers may claim its tasks | run on Vercel; appear in a cloud agent's env |
| CLI worker | `CLI_WORKER_PRIVATE_KEY` | nothing | the seeded worker of the headless loop (dev SIWE session; relayed routes) | be presented as a person |
| Treasury | `TREASURY_ADDRESS` | fees | receives 0.45 per 3.00 task | — |

Onchain consequences: the four contracts read `relayer()`, `attestationVerifier()`, `signer()` and `owner()`; changing a key is one owner call each. `TxQueue` (`packages/chain`) is the only sender for the relayer and signer keys — many serverless invocations, one nonce sequence per key (Postgres advisory lock on the `nonces` row).

Honesty lines that follow from this table (verbatim in README and narration): "cloud-verified, operator-attested — onchain World ID verification is Orb-only today" · "our custody is the one block between settlement and escrow, and we say so" · "today I am on both sides of this: my agent, my phone, my key resolves disputes. The contract doesn't know that, and that's the point of putting it in a contract."
