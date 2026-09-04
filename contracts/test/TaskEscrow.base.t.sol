// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {TaskEscrow} from "../src/TaskEscrow.sol";
import {ITaskEscrow} from "../src/interfaces/ITaskEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {MockReputation} from "./mocks/MockReputation.sol";
import {MockAbuseMark} from "./mocks/MockAbuseMark.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Shared fixture for the TaskEscrow suites: one escrow, four mocks, three workers.
/// @dev Balances are always asserted as before/after deltas, never as absolutes, so a test
///      keeps meaning when an earlier step in the same test moves money.
abstract contract TaskEscrowBase is Test {
    TaskEscrow internal escrow;
    MockUSDC internal usdc;
    MockRegistry internal registry;
    MockReputation internal reputation;
    MockAbuseMark internal abuseMark;

    address internal deployer = Keys.deployer();
    address internal relayer = Keys.relayer();
    address internal buyer = Keys.buyer();
    address internal treasury = Keys.treasury();
    /// @dev worker1 and worker3 are real humans; worker2 is seeded demo data.
    address internal worker1 = Keys.worker1();
    address internal worker2 = Keys.worker2();
    address internal worker3 = Keys.worker3();

    bytes32 internal constant SPEC_HASH = keccak256("spec");
    uint96 internal constant AMOUNT = 3_000_000;
    uint96 internal constant FEE = 450_000;
    uint96 internal constant LOCKED = 3_450_000;

    function setUp() public virtual {
        vm.warp(1_757_000_000);

        usdc = new MockUSDC();
        registry = new MockRegistry();
        reputation = new MockReputation();
        abuseMark = new MockAbuseMark();
        escrow = new TaskEscrow(
            deployer,
            address(usdc),
            treasury,
            relayer,
            address(registry),
            address(reputation),
            address(abuseMark)
        );

        usdc.mint(relayer, 100_000_000);
        usdc.mint(buyer, 100_000_000);
        vm.prank(relayer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        registry.setWorker(worker1, 0xA11CE, false);
        registry.setWorker(worker2, 0x5EED, true);
        registry.setWorker(worker3, 0xB0B, false);
    }

    /// @dev The filmed task: 3.00 posted, 0.45 fee, 3.45 locked; a 120 s dispute window so
    ///      the auto-release path is what judges see.
    function _params() internal pure returns (ITaskEscrow.PostParams memory) {
        return ITaskEscrow.PostParams({
            taskType: 1,
            specHash: SPEC_HASH,
            amount: AMOUNT,
            buyer: Keys.buyer(),
            buyerAgentId: 1207,
            area: "ez5ku",
            claimTTL: 1800,
            submitTTL: 3600,
            disputeWindow: 120
        });
    }

    function _post() internal returns (uint256 taskId) {
        return _post(_params());
    }

    function _post(ITaskEscrow.PostParams memory p) internal returns (uint256 taskId) {
        vm.prank(relayer);
        return escrow.post(p);
    }

    function _claim(uint256 taskId, address worker) internal {
        vm.prank(relayer);
        escrow.claimFor(taskId, worker);
    }

    function _submit(uint256 taskId, address worker, bytes32 proofHash) internal {
        vm.prank(relayer);
        escrow.submitFor(taskId, worker, proofHash);
    }

    function _allowlist(address buyer_) internal {
        vm.prank(deployer);
        escrow.setAllowlistedBuyer(buyer_, true);
    }
}
