// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";

import {Env} from "./lib/Env.s.sol";
import {WorkerRegistry} from "../src/WorkerRegistry.sol";
import {Reputation} from "../src/Reputation.sol";
import {AbuseMark} from "../src/AbuseMark.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "../test/mocks/MockERC8004.sol";

/// @title Deploy - the four contracts, wired, recorded
/// @notice Puts `WorkerRegistry`, `Reputation`, `AbuseMark` and `TaskEscrow` on chain, wires the
///         five settable roles and writes `deployments/<chain>.json`, which is the single record
///         `packages/shared/src/addresses.ts`, the subgraph manifest and every app read.
///
///         Runs against Base Sepolia (84532) with the live USDC and the live ERC-8004 registries,
///         and against a local anvil (31337) with the repository's mocks, because the e2e harness
///         and the operator's rehearsal have to exercise the same script that ships.
///
/// @dev Every step reads before it writes. A second run against a chain that already holds the
///      deployment re-derives nothing, sends no transaction and leaves the record byte-identical.
contract Deploy is Env {
    uint256 internal constant ANVIL = 31337;

    /// @notice Opening float minted to the relayer and to the demo agent on anvil: 1000 USDC each,
    ///         6-decimal integers. Far more than the five seeded lifecycles need, so a rehearsal
    ///         never stops on a top-up.
    uint256 internal constant MOCK_MINT = 1_000_000_000;

    /// @dev One struct rather than nine arguments: the record has more fields than a non-via-ir
    ///      stack frame can carry, and every one of them has to reach `_write` together.
    struct Record {
        address registry;
        address reputation;
        address abuseMark;
        address escrow;
        address usdc;
        address identity;
        address reputationRegistry;
        uint256 startBlock;
    }

    function run() external {
        string memory path = deploymentsPath();
        Record memory r;
        bool resume = _canResume(path);

        if (resume) _load(path, r);

        r.startBlock = block.number;

        vm.startBroadcast(deployerKey);
        if (!resume) _deploy(r);
        _wire(r);
        vm.stopBroadcast();

        _assertWired(r);
        _write(path, r);
    }

    // ------------------------------------------------------------------- re-run guard

    /// @notice True when this chain already holds the deployment named in the record.
    /// @dev The file alone is not enough: an anvil restart leaves yesterday's record pointing at
    ///      addresses with no code, and resuming onto those would seed a pool nothing can settle.
    ///      `FORCE_REDEPLOY` overrides; `.env.example` ships it as `0`, so zero means "guard on".
    function _canResume(string memory path) internal view returns (bool) {
        if (vm.envOr("FORCE_REDEPLOY", uint256(0)) != 0) return false;
        if (!vm.exists(path)) return false;

        string memory json = vm.readFile(path);
        if (!vm.keyExistsJson(json, ".addresses.taskEscrow")) return false;

        return vm.parseJsonAddress(json, ".addresses.taskEscrow").code.length > 0;
    }

    /// @dev The externals come off the chain rather than out of the file. `TaskEscrow.usdc` and
    ///      both of `AbuseMark`'s registries are immutable, so reading them is the one source that
    ///      cannot disagree with the deployment the guard just found - and on anvil it is what
    ///      stops a resumed run minting a second MockUSDC the escrow would never accept.
    function _load(string memory path, Record memory r) internal view {
        string memory json = vm.readFile(path);
        r.registry = vm.parseJsonAddress(json, ".addresses.workerRegistry");
        r.escrow = vm.parseJsonAddress(json, ".addresses.taskEscrow");
        r.reputation = vm.parseJsonAddress(json, ".addresses.reputation");
        r.abuseMark = vm.parseJsonAddress(json, ".addresses.abuseMark");
        r.usdc = TaskEscrow(r.escrow).usdc();
        r.identity = address(AbuseMark(r.abuseMark).identityRegistry());
        r.reputationRegistry = address(AbuseMark(r.abuseMark).reputationRegistry());
        console2.log("deploy: skipped, already at", r.escrow);
    }

    // --------------------------------------------------------------------- deployment

    function _deploy(Record memory r) internal {
        _externals(r);

        r.registry = address(new WorkerRegistry(deployer, relayer, verifier));
        r.reputation = address(new Reputation(deployer));
        r.abuseMark = address(new AbuseMark(deployer, signer, r.identity, r.reputationRegistry));
        r.escrow = address(
            new TaskEscrow(deployer, r.usdc, treasury, relayer, r.registry, r.reputation, r.abuseMark)
        );

        console2.log("deploy: WorkerRegistry", r.registry);
        console2.log("deploy: Reputation    ", r.reputation);
        console2.log("deploy: AbuseMark     ", r.abuseMark);
        console2.log("deploy: TaskEscrow    ", r.escrow);
    }

    /// @dev Anvil gets the repository's mocks; Base Sepolia gets the three live addresses out of
    ///      `.env`, each checked for code. An env var typo would otherwise deploy an escrow whose
    ///      immutable `usdc` points at nothing, and immutables have no setter to fix that with.
    function _externals(Record memory r) internal {
        if (block.chainid == ANVIL) {
            MockUSDC mock = new MockUSDC();
            r.usdc = address(mock);
            r.identity = address(new MockIdentityRegistry());
            r.reputationRegistry = address(new MockReputationRegistry());
            mock.mint(relayer, MOCK_MINT);
            mock.mint(buyer, MOCK_MINT);
            return;
        }

        r.usdc = vm.envAddress("USDC_ADDRESS");
        r.identity = vm.envAddress("ERC8004_IDENTITY_ADDRESS");
        r.reputationRegistry = vm.envAddress("ERC8004_REPUTATION_ADDRESS");
        require(r.usdc.code.length > 0, "Deploy: USDC_ADDRESS has no code on this chain");
        require(r.identity.code.length > 0, "Deploy: ERC8004_IDENTITY_ADDRESS has no code on this chain");
        require(
            r.reputationRegistry.code.length > 0,
            "Deploy: ERC8004_REPUTATION_ADDRESS has no code on this chain"
        );
    }

    // ------------------------------------------------------------------------- wiring

    /// @dev Read the current value, call the setter only when it differs. That is what lets the
    ///      whole script run twice: the five setters are the only writes a resumed run could make.
    function _ensure(address current, address want, function(address) external setter) internal {
        if (current != want) setter(want);
    }

    function _wire(Record memory r) internal {
        _ensure(WorkerRegistry(r.registry).relayer(), relayer, WorkerRegistry(r.registry).setRelayer);
        _ensure(
            WorkerRegistry(r.registry).attestationVerifier(),
            verifier,
            WorkerRegistry(r.registry).setAttestationVerifier
        );
        _ensure(AbuseMark(r.abuseMark).signer(), signer, AbuseMark(r.abuseMark).setSigner);
        _ensure(AbuseMark(r.abuseMark).escrow(), r.escrow, AbuseMark(r.abuseMark).setEscrow);
        _ensure(Reputation(r.reputation).escrow(), r.escrow, Reputation(r.reputation).setEscrow);
    }

    /// @dev The escrow's own four are immutable, so they are asserted rather than ensured: a
    ///      mismatch there is a redeploy, not a setter, and it must not reach the record.
    function _assertWired(Record memory r) internal view {
        require(WorkerRegistry(r.registry).relayer() == relayer, "wire: registry.relayer");
        require(
            WorkerRegistry(r.registry).attestationVerifier() == verifier, "wire: registry.attestationVerifier"
        );
        require(AbuseMark(r.abuseMark).signer() == signer, "wire: abuseMark.signer");
        require(AbuseMark(r.abuseMark).escrow() == r.escrow, "wire: abuseMark.escrow");
        require(Reputation(r.reputation).escrow() == r.escrow, "wire: reputation.escrow");
        require(TaskEscrow(r.escrow).usdc() == r.usdc, "wire: escrow.usdc");
        require(TaskEscrow(r.escrow).treasury() == treasury, "wire: escrow.treasury");
        require(TaskEscrow(r.escrow).relayer() == relayer, "wire: escrow.relayer");
    }

    // ---------------------------------------------------------------------- the record

    /// @dev The four contract keys and the nesting are T-01a's - `addresses.ts` reads
    ///      `addresses.workerRegistry` and throws without it - so the provenance fields are added
    ///      around that shape rather than in place of it. `parseDeployment` ignores what it does
    ///      not know, which is what makes `usdc`, `treasury` and `relayer` safe to add here.
    function _write(string memory path, Record memory r) internal {
        string memory previous = vm.exists(path) ? vm.readFile(path) : "";

        string memory addrKey = "legwork.deployment.addresses";
        vm.serializeAddress(addrKey, "workerRegistry", r.registry);
        vm.serializeAddress(addrKey, "taskEscrow", r.escrow);
        vm.serializeAddress(addrKey, "reputation", r.reputation);
        vm.serializeAddress(addrKey, "abuseMark", r.abuseMark);
        vm.serializeAddress(addrKey, "erc8004Identity", r.identity);
        string memory addresses = vm.serializeAddress(addrKey, "erc8004Reputation", r.reputationRegistry);

        string memory root = "legwork.deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeString(root, "addresses", addresses);
        vm.serializeAddress(root, "usdc", r.usdc);
        vm.serializeAddress(root, "treasury", treasury);
        vm.serializeAddress(root, "relayer", relayer);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeUint(root, "startBlock", _startBlock(previous, r.startBlock));
        vm.serializeString(root, "deployedAt", _deployedAt(previous));
        string memory out = vm.serializeString(root, "txs", _txs(previous));

        vm.writeJson(out, path);
        console2.log("deploy: wrote", path);
    }

    /// @dev `block.number` at the start of the run is a lower bound the subgraph can index from;
    ///      `scripts/deploy.sh` replaces it with the `WorkerRegistry` receipt's block. A resumed
    ///      run keeps whatever is already recorded - today's block number is not a lower bound for
    ///      a contract deployed last week, and raising it would silently skip history.
    function _startBlock(string memory previous, uint256 fallbackBlock) internal view returns (uint256) {
        if (bytes(previous).length == 0) return fallbackBlock;
        if (!vm.keyExistsJson(previous, ".startBlock")) return fallbackBlock;
        uint256 recorded = vm.parseJsonUint(previous, ".startBlock");
        return recorded == 0 ? fallbackBlock : recorded;
    }

    /// @dev Unix seconds, as a string: `Deployment.deployedAt` is typed `string` in T-01a's
    ///      `addresses.ts`. Preserved across a resumed run - it records when the code went on
    ///      chain, not when the script last looked at it.
    function _deployedAt(string memory previous) internal view returns (string memory) {
        if (bytes(previous).length != 0 && vm.keyExistsJson(previous, ".deployedAt")) {
            string memory recorded = vm.parseJsonString(previous, ".deployedAt");
            if (bytes(recorded).length != 0) return recorded;
        }
        return vm.toString(block.timestamp);
    }

    /// @dev Empty on a fresh deploy; `scripts/deploy.sh` fills it from the broadcast log. Carried
    ///      forward on a resumed run, so re-running the wrapper cannot blank the hashes RESULTS
    ///      links to.
    function _txs(string memory previous) internal returns (string memory) {
        if (bytes(previous).length == 0) return "{}";
        if (!vm.keyExistsJson(previous, ".txs")) return "{}";

        string[] memory names = vm.parseJsonKeys(previous, ".txs");
        if (names.length == 0) return "{}";

        string memory key = "legwork.deployment.txs";
        string memory out;
        for (uint256 i = 0; i < names.length; i++) {
            out = vm.serializeString(
                key, names[i], vm.parseJsonString(previous, string.concat(".txs.", names[i]))
            );
        }
        return out;
    }
}
