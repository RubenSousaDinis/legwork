# Vendored ERC-8004 ABIs

Bare ABI arrays for the two ERC-8004 registries Legwork calls on Base Sepolia. Not Foundry
artifacts — each file is a top-level JSON array, importable directly (`resolveJsonModule`).

| File | Contract |
|---|---|
| `IdentityRegistry.json` | ERC-8004 IdentityRegistry (`register` / `ownerOf` / `getAgentWallet`) |
| `ReputationRegistry.json` | ERC-8004 ReputationRegistry (`giveFeedback` / `getSummary`) |

## Source

Reference implementation: **github.com/erc-8004/erc-8004-contracts**, licensed **CC0 — public domain**
(the Solidity sources carry `SPDX-License-Identifier: MIT`; `package.json` says ISC).

Commit read for this vendoring: **`b9e466c250744a7e06b13dff9d3c2844ed64f825`** ("Fixed typo",
2026-08-15) — the repository's default-branch tip on 2026-09-07.

**The arrays here are the Basescan-verified ABIs of the two deployed implementations, not the
compile output of that commit.** The reference repository is a Hardhat project and no build was
run in this environment, so the brief's documented fallback was taken: the ABIs come from the
verified source of the exact bytecode Legwork calls. That is also the more accurate choice — the
deployed implementations are an earlier revision than the commit above, and the two disagree:

- `IdentityRegistry`: the deployed implementation has `isAuthorizedOrOwner(address,uint256) → bool`,
  which commit `b9e466c` does not; commit `b9e466c` declares three `ECDSA*` errors the deployed
  implementation does not. Vendored here: the deployed set (63 entries).
- `ReputationRegistry`: byte-for-byte identical between the two (35 entries). No divergence.

Every function Legwork uses — `register(string)`, `ownerOf(uint256)`, `getAgentWallet(uint256)`,
`giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` and
`getSummary(uint256,address[],string,string)` — is identical across both sources and matches
`contracts/src/interfaces/IERC8004.sol`. Confirmed live by `scripts/spikes/s5-erc8004.ts`; see
`docs/spikes/RESULTS.md` `## S5`.

## Addresses (Base Sepolia, chain 84532)

| Role | Address |
|---|---|
| IdentityRegistry proxy (ERC-1967) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| IdentityRegistry implementation | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` |
| ReputationRegistry proxy (ERC-1967) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ReputationRegistry implementation | `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` |

Both proxies report `getVersion() → "2.0.0"`; the implementation addresses above are the ERC-1967
implementation slot read live off each proxy. `ReputationRegistry.getIdentityRegistry()` returns the
IdentityRegistry proxy, so the two are wired to each other.

Read the addresses from `ERC8004_IDENTITY_ADDRESS` / `ERC8004_REPUTATION_ADDRESS`, never from a
literal in a call site. These registries are live and not ours: Legwork registers into them, it does
not own them.

## Note for callers

`register` is overloaded three ways on the IdentityRegistry — `register()`, `register(string)` and
`register(string,(string,bytes)[])`. Passing a single string argument selects `register(string)`.
