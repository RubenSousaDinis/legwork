// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

/// @title Env — the role keys and the deployment-record path, read once per run
/// @notice Every deploy script reads the same eight roles out of the operator's `.env`.
///         Reading them in one place is what keeps `Deploy` and `Seed` agreeing on who the
///         relayer is: a script that derived its own would happily seed a pool the escrow
///         cannot pay out of.
/// @dev Private keys are held as `uint256` and never logged, printed or serialized. Only the
///      addresses derived from them ever leave this contract.
abstract contract Env is Script {
    /// @notice Owner of the four contracts. Broadcasts every deployment and every setter.
    uint256 internal deployerKey;
    /// @notice Holds the USDC float. Broadcasts `post` / `claimFor` / `submitFor` / `approve`.
    uint256 internal relayerKey;

    address internal deployer;
    address internal relayer;
    /// @notice Signs EIP-712 registration attestations. Never sends a transaction.
    address internal verifier;
    /// @notice `AbuseMark.mark` caller. Never sends a transaction here.
    address internal signer;
    /// @notice The demo agent, allowlisted so the seeded CLI worker can claim its tasks.
    address internal buyer;
    /// @notice The seeded CLI worker — worker 1 of the 20 seeded rows.
    address internal cliWorker;
    /// @notice Receives the 0.45 fee on every release.
    address internal treasury;

    /// @dev `forge script` calls this before `run()`, so the roles are in place for both
    ///      scripts without either of them having to remember to ask.
    function setUp() public virtual {
        loadEnv();
    }

    function loadEnv() internal {
        deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        relayerKey = vm.envUint("RELAYER_PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        relayer = vm.addr(relayerKey);
        verifier = vm.addr(vm.envUint("ATTESTATION_VERIFIER_PRIVATE_KEY"));
        signer = vm.addr(vm.envUint("ABUSEMARK_SIGNER_PRIVATE_KEY"));
        buyer = vm.addr(vm.envUint("BUYER_PRIVATE_KEY"));
        cliWorker = vm.addr(vm.envUint("CLI_WORKER_PRIVATE_KEY"));
        treasury = vm.envAddress("TREASURY_ADDRESS");
    }

    /// @notice Where this chain's deployment record lives, relative to `contracts/`.
    /// @dev Two chains only. A third would write a record every downstream reader would
    ///      mistake for one of these two, so it reverts instead of guessing a filename.
    function deploymentsPath() internal view returns (string memory) {
        if (block.chainid == 31337) return "deployments/anvil.json";
        if (block.chainid == 84532) return "deployments/base-sepolia.json";
        revert("Env: unsupported chain - expected 31337 (anvil) or 84532 (Base Sepolia)");
    }
}
