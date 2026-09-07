// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {Env} from "./lib/Env.s.sol";
import {IWorkerRegistry} from "../src/interfaces/IWorkerRegistry.sol";
import {ITaskEscrow} from "../src/interfaces/ITaskEscrow.sol";

/// @title Seed - the demo pool: 20 seeded workers and five completed lifecycles
/// @notice Fills the pool the preflight medians and the feed read from. Twenty demo rows go in
///         through `seedWorker`, which sets `seeded = true` and emits `WorkerSeeded` and never
///         `WorkerRegistered`, so the subgraph and the dashboard can tell a demo row from a
///         verified human from the event alone. This path cannot mint a verified registration.
///
///         Every seeded task is posted with `buyer = deployer`, and the deployer is allowlisted:
///         seeded completions feed the preflight medians; no seeded address can ever claim a task
///         a real buyer paid for.
///
/// @dev Idempotent throughout. A worker already in the registry is skipped, a lifecycle whose id
///      already exists is skipped, and an allowance already in place is left alone, so the script
///      can be re-run against a pool it has already seeded without moving any money.
contract Seed is Env {
    /// @notice Worker 1 is the CLI worker. The pool reads "1 real - +20 seeded (demo data)".
    uint256 internal constant SEEDED_WORKERS = 20;
    uint256 internal constant LIFECYCLES = 5;

    /// @notice The posted rate, a 6-decimal USDC integer: 3.00. The escrow charges the 0.45 fee
    ///         (450_000) on top, so each lifecycle pulls 3_450_000 from the relayer's float.
    uint96 internal constant TASK_AMOUNT = 3_000_000;
    /// @notice Five lifecycles at 3_450_000 each. Below this the seed cannot finish, and five
    ///         released tasks are the demo's floor.
    uint256 internal constant RELAYER_FLOAT = 17_250_000;

    uint32 internal constant CLAIM_TTL = 1800;
    uint32 internal constant SUBMIT_TTL = 3600;
    uint32 internal constant DISPUTE_WINDOW = 120;

    /// @notice Geohash-5 areas. A coordinate never reaches a public surface, so a seeded row
    ///         carries the same five-character cell a real one does.
    string[5] internal areas = ["ez1dp", "ez5kv", "ez5ks", "ez5kt", "ez5kg"];
    /// @notice Task-type bitmask cycle for workers 6..20: verify-open, photo-of, call-confirm,
    ///         compare-two, then all four. Workers 1..5 carry all four so every lifecycle type
    ///         has a worker that can take it.
    uint8[5] internal typeCycle = [1, 2, 4, 8, 15];
    /// @notice One lifecycle per posted task type, plus a second verify-open.
    uint8[5] internal lifecycleTypes = [1, 2, 4, 8, 1];

    function run() external {
        string memory json = vm.readFile(deploymentsPath());
        address registry = vm.parseJsonAddress(json, ".addresses.workerRegistry");
        address escrow = vm.parseJsonAddress(json, ".addresses.taskEscrow");
        address usdc = vm.parseJsonAddress(json, ".usdc");

        _preconditions(registry, escrow, usdc);

        vm.startBroadcast(deployerKey);
        _allowlist(escrow);
        _seedWorkers(registry);
        vm.stopBroadcast();

        vm.startBroadcast(relayerKey);
        _approveFloat(escrow, usdc);
        _lifecycles(escrow);
        vm.stopBroadcast();

        console2.log("seed: taskCount", ITaskEscrow(escrow).taskCount());
        console2.log("seed: 20 seeded (demo data)");
    }

    // ------------------------------------------------------------------ preconditions

    /// @dev Checked before the first broadcast, so a short float fails with a sentence the
    ///      operator can act on rather than half a seeded pool and a revert on lifecycle three.
    function _preconditions(address registry, address escrow, address usdc) internal view {
        require(usdc == ITaskEscrow(escrow).usdc(), "Seed: record's usdc is not the escrow's usdc");
        require(
            IERC20(usdc).balanceOf(relayer) >= RELAYER_FLOAT,
            "Seed: relayer holds less than 17.25 USDC - top it up at faucet.circle.com (Base Sepolia)"
        );
        require(deployer.balance > 0.01 ether, "Seed: deployer holds less than 0.01 ETH for gas");
        require(relayer.balance > 0.01 ether, "Seed: relayer holds less than 0.01 ETH for gas");
        require(
            Ownable(registry).owner() == deployer,
            "Seed: DEPLOYER_PRIVATE_KEY does not own the WorkerRegistry"
        );
    }

    // ------------------------------------------------------------ the seeded worker set

    /// @notice Worker 1 is the CLI worker, so the one real person on the demo shares the pool
    ///         with 20 seeded rows rather than standing outside it.
    function _worker(uint256 n) internal view returns (address) {
        if (n == 1) return cliWorker;
        return vm.addr(uint256(keccak256(abi.encodePacked("legwork-seed-worker-", vm.toString(n)))));
    }

    /// @dev Synthetic, and derived in the open: nothing here is or resembles a World ID nullifier.
    function _nullifier(uint256 n) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked("seed-", vm.toString(n))));
    }

    function _taskTypes(uint256 n) internal view returns (uint8) {
        return n <= 5 ? 15 : typeCycle[n % 5];
    }

    function _seedWorkers(address registry) internal {
        for (uint256 n = 1; n <= SEEDED_WORKERS; n++) {
            address worker = _worker(n);
            if (IWorkerRegistry(registry).isWorker(worker)) continue;
            IWorkerRegistry(registry).seedWorker(worker, _nullifier(n), areas[n % 5], _taskTypes(n));
        }
        console2.log("seed: seeded workers in registry", registry);
    }

    /// @dev The deployer is the buyer of record on every seeded task; the demo agent is
    ///      allowlisted so the seeded CLI worker can claim what it posts during the filmed run.
    function _allowlist(address escrow) internal {
        if (!ITaskEscrow(escrow).allowlistedBuyer(deployer)) {
            ITaskEscrow(escrow).setAllowlistedBuyer(deployer, true);
        }
        if (!ITaskEscrow(escrow).allowlistedBuyer(buyer)) {
            ITaskEscrow(escrow).setAllowlistedBuyer(buyer, true);
        }
    }

    // -------------------------------------------------------------------- the lifecycles

    function _approveFloat(address escrow, address usdc) internal {
        if (IERC20(usdc).allowance(relayer, escrow) < RELAYER_FLOAT) {
            IERC20(usdc).approve(escrow, type(uint256).max);
        }
    }

    function _params(uint256 k) internal view returns (ITaskEscrow.PostParams memory) {
        return ITaskEscrow.PostParams({
            taskType: lifecycleTypes[k - 1],
            specHash: keccak256(abi.encodePacked("seed-task-", vm.toString(k))),
            amount: TASK_AMOUNT,
            buyer: deployer,
            buyerAgentId: 0,
            area: areas[k % 5],
            claimTTL: CLAIM_TTL,
            submitTTL: SUBMIT_TTL,
            disputeWindow: DISPUTE_WINDOW
        });
    }

    /// @dev One lifecycle closes before the next opens, so the open count never exceeds 1 and the
    ///      escrow's per-buyer open cap is never in play. `buyerAgentId = 0` means no ERC-8004
    ///      write and a rater key of the deployer's address: a demo completion must not put
    ///      feedback on an agent identity that did not ask for the task.
    function _lifecycles(address escrow) internal {
        for (uint256 k = 1; k <= LIFECYCLES; k++) {
            if (ITaskEscrow(escrow).taskCount() >= k) continue;

            address worker = _worker(k);
            uint256 taskId = ITaskEscrow(escrow).post(_params(k));
            ITaskEscrow(escrow).claimFor(taskId, worker);
            ITaskEscrow(escrow)
                .submitFor(taskId, worker, keccak256(abi.encodePacked("seed-proof-", vm.toString(k))));
            ITaskEscrow(escrow).approve(taskId);

            console2.log("seed: lifecycle released, task", taskId);
        }
    }
}
