// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ITaskEscrow} from "../src/interfaces/ITaskEscrow.sol";
import {MockAbuseMark} from "./mocks/MockAbuseMark.sol";
import {MockReputation} from "./mocks/MockReputation.sol";
import {TaskEscrowBase} from "./TaskEscrow.base.t.sol";

/// @notice PR 2/2 of T-12: approve, dispute, autoRelease, resolve and the two feedback hooks.
/// @dev Anything time-dependent reads `submittedAt` back from `getTask` rather than
///      snapshotting `block.timestamp` in the test — under `--ir-minimum` via-ir re-reads such
///      a local at each use and silently warps to the wrong second.
contract TaskEscrowReleaseTest is TaskEscrowBase {
    bytes32 internal constant PROOF = keccak256("proof");

    /// @dev post -> claim -> submit, ready for a settlement call.
    function _submitted(address worker) internal returns (uint256 taskId) {
        taskId = _post();
        _claim(taskId, worker);
        _submit(taskId, worker, PROOF);
    }

    function test_Release_SplitsAmountAndFee() public {
        uint256 id = _submitted(worker1);

        uint256 workerBefore = usdc.balanceOf(worker1);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskReleased(id, worker1, AMOUNT, FEE);
        vm.prank(buyer);
        escrow.approve(id);

        assertEq(usdc.balanceOf(worker1), workerBefore + AMOUNT, "the worker keeps the posted 3.00");
        assertEq(usdc.balanceOf(treasury), treasuryBefore + FEE, "the treasury takes the 0.45 fee");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - LOCKED, "the escrow releases 3.45");
        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Released));
        assertEq(escrow.activeClaimOf(worker1), 0, "the claim slot is freed on release");
        assertEq(escrow.openTasksOf(buyer), 0);

        // The relayer may accept on the buyer's behalf.
        uint256 relayed = _submitted(worker3);
        vm.prank(relayer);
        escrow.approve(relayed);
        assertEq(uint8(escrow.getTask(relayed).state), uint8(ITaskEscrow.TaskState.Released));

        uint256 notYours = _submitted(worker1);
        vm.prank(worker1);
        vm.expectRevert(ITaskEscrow.NotBuyerOrRelayer.selector);
        escrow.approve(notYours);

        uint256 claimedOnly = _post();
        _claim(claimedOnly, worker3);
        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.approve(claimedOnly);
    }

    function test_Release_WritesHooks() public {
        uint256 id = _submitted(worker1);
        vm.prank(buyer);
        escrow.approve(id);

        MockReputation.Call memory rep = reputation.lastCall();
        assertEq(rep.nullifierHash, 0xA11CE, "keyed by the worker's nullifier, not the address");
        assertEq(rep.raterKey, bytes32(uint256(1207)), "the buyer's ERC-8004 id is the rater");
        assertEq(rep.outcome, 1);
        assertEq(rep.taskId, id);

        MockAbuseMark.OutcomeCall memory mark = abuseMark.lastOutcome();
        assertEq(mark.agentId, 1207);
        assertEq(mark.taskId, id);
        assertEq(mark.outcome, 1);
        assertEq(abuseMark.outcomeCallCount(), 1);

        // A buyer with no ERC-8004 identity rates as an address, and there is nothing to mark.
        ITaskEscrow.PostParams memory p = _params();
        p.buyerAgentId = 0;
        uint256 anon = _post(p);
        _claim(anon, worker3);
        _submit(anon, worker3, PROOF);
        vm.prank(buyer);
        escrow.approve(anon);

        MockReputation.Call memory anonRep = reputation.lastCall();
        assertEq(anonRep.nullifierHash, 0xB0B);
        assertEq(anonRep.raterKey, bytes32(uint256(uint160(buyer))), "the buyer address is the rater");
        assertEq(anonRep.outcome, 1);
        assertEq(abuseMark.outcomeCallCount(), 1, "no agent id, no agent-side outcome");
    }

    function test_Dispute_InsideWindow() public {
        uint256 id = _submitted(worker1);
        uint256 s0 = escrow.getTask(id).submittedAt;

        vm.prank(worker1);
        vm.expectRevert(ITaskEscrow.NotBuyerOrRelayer.selector);
        escrow.dispute(id);

        vm.warp(s0 + 119);
        uint256 workerBefore = usdc.balanceOf(worker1);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskDisputed(id);
        vm.prank(buyer);
        escrow.dispute(id);

        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Disputed));
        assertEq(usdc.balanceOf(worker1), workerBefore, "a dispute moves no money");
        assertEq(usdc.balanceOf(buyer), buyerBefore, "a dispute moves no money");
        assertEq(usdc.balanceOf(treasury), treasuryBefore, "a dispute moves no money");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore, "the escrow still holds 3.45");

        vm.prank(worker3);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.autoRelease(id);

        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.approve(id);

        // The relayer may dispute on the buyer's behalf.
        uint256 relayed = _submitted(worker3);
        vm.prank(relayer);
        escrow.dispute(relayed);
        assertEq(uint8(escrow.getTask(relayed).state), uint8(ITaskEscrow.TaskState.Disputed));
    }

    function test_AutoRelease_AfterWindow() public {
        uint256 id = _submitted(worker1);
        uint256 s0 = escrow.getTask(id).submittedAt;

        uint256 workerBefore = usdc.balanceOf(worker1);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        // A buyer who stops watching cannot hold a worker's proof by doing nothing.
        vm.warp(s0 + 120);
        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskReleased(id, worker1, AMOUNT, FEE);
        vm.prank(worker3);
        escrow.autoRelease(id);

        assertEq(usdc.balanceOf(worker1), workerBefore + AMOUNT);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + FEE);
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - LOCKED);
        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Released));
        assertEq(escrow.activeClaimOf(worker1), 0);
        assertEq(escrow.openTasksOf(buyer), 0);

        MockReputation.Call memory rep = reputation.lastCall();
        assertEq(rep.nullifierHash, 0xA11CE);
        assertEq(rep.outcome, 1);
        assertEq(rep.taskId, id);
        MockAbuseMark.OutcomeCall memory mark = abuseMark.lastOutcome();
        assertEq(mark.agentId, 1207);
        assertEq(mark.taskId, id);
        assertEq(mark.outcome, 1);
    }

    function test_Boundary_DisputeWindow() public {
        uint256 early = _submitted(worker1);
        uint256 late = _submitted(worker3);
        uint256 s0 = escrow.getTask(early).submittedAt;

        vm.warp(s0 + 119);
        vm.prank(worker2);
        vm.expectRevert(ITaskEscrow.DisputeWindowOpen.selector);
        escrow.autoRelease(early);
        vm.prank(buyer);
        escrow.dispute(early);
        assertEq(uint8(escrow.getTask(early).state), uint8(ITaskEscrow.TaskState.Disputed));

        vm.warp(s0 + 120);
        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.DisputeWindowClosed.selector);
        escrow.dispute(late);
        vm.prank(worker2);
        escrow.autoRelease(late);
        assertEq(uint8(escrow.getTask(late).state), uint8(ITaskEscrow.TaskState.Released));
    }

    function test_Resolve_ToBuyer_NoFee() public {
        uint256 id = _submitted(worker1);
        vm.prank(buyer);
        escrow.dispute(id);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 workerBefore = usdc.balanceOf(worker1);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskResolved(id, true);
        vm.prank(deployer);
        escrow.resolve(id, true);

        assertEq(usdc.balanceOf(buyer), buyerBefore + LOCKED, "the buyer gets the rate and the fee back");
        assertEq(usdc.balanceOf(worker1), workerBefore, "the worker is paid nothing");
        assertEq(usdc.balanceOf(treasury), treasuryBefore, "we do not earn on a task we arbitrate");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - LOCKED);
        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Resolved));
        assertEq(escrow.activeClaimOf(worker1), 0);
        assertEq(escrow.openTasksOf(buyer), 0);

        MockReputation.Call memory rep = reputation.lastCall();
        assertEq(rep.nullifierHash, 0xA11CE);
        assertEq(rep.raterKey, bytes32(uint256(1207)));
        assertEq(rep.outcome, 3);
        assertEq(rep.taskId, id);
        MockAbuseMark.OutcomeCall memory mark = abuseMark.lastOutcome();
        assertEq(mark.agentId, 1207);
        assertEq(mark.taskId, id);
        assertEq(mark.outcome, 3);
    }

    function test_Resolve_ToWorker_NoFee() public {
        uint256 id = _submitted(worker1);
        vm.prank(buyer);
        escrow.dispute(id);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        escrow.resolve(id, false);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 workerBefore = usdc.balanceOf(worker1);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskResolved(id, false);
        vm.prank(deployer);
        escrow.resolve(id, false);

        assertEq(usdc.balanceOf(worker1), workerBefore + AMOUNT, "the worker keeps the posted 3.00");
        assertEq(usdc.balanceOf(buyer), buyerBefore + FEE, "the fee goes back to the buyer");
        assertEq(usdc.balanceOf(treasury), treasuryBefore, "we do not earn on a task we arbitrate");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - LOCKED);
        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Resolved));

        MockReputation.Call memory rep = reputation.lastCall();
        assertEq(rep.outcome, 2);
        assertEq(rep.taskId, id);
        MockAbuseMark.OutcomeCall memory mark = abuseMark.lastOutcome();
        assertEq(mark.agentId, 1207);
        assertEq(mark.outcome, 2);

        uint256 submitted = _submitted(worker3);
        vm.prank(deployer);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.resolve(submitted, false);
    }

    function test_Pause_NeverBlocksRelease() public {
        // Four claimants, because a claim slot stays held through Submitted and Disputed and
        // claiming is itself pause-gated: every task that must settle under the pause needs
        // its own worker in place before it. The base fixture names three.
        address worker4 = address(0xC1A11);
        registry.setWorker(worker4, 0xC0FFEE, false);
        _allowlist(buyer);

        uint256 toExpire = _post();

        uint256 toReleaseClaim = _post();
        _claim(toReleaseClaim, worker1);

        uint256 toSubmit = _post();
        _claim(toSubmit, worker3);

        // A long window so this one is still disputable at the moment the others have aged out.
        ITaskEscrow.PostParams memory wide = _params();
        wide.disputeWindow = 604_800;
        uint256 toDispute = _post(wide);
        _claim(toDispute, worker2);
        _submit(toDispute, worker2, PROOF);

        uint256 toAutoRelease = _post();
        _claim(toAutoRelease, worker4);
        _submit(toAutoRelease, worker4, PROOF);

        assertEq(escrow.openTasksOf(buyer), 5);
        vm.warp(escrow.getTask(toExpire).postedAt + 1801);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        escrow.pause();

        vm.prank(deployer);
        escrow.pause();

        // Nothing new comes in while the operator has stopped.
        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.post(_params());

        vm.prank(buyer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.postAsBuyer(_params());

        vm.prank(worker3);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.claim(toExpire);

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.claimFor(toExpire, worker3);

        // Everything already in flight still settles. A stop cannot trap earned funds.
        uint256 workerBefore = usdc.balanceOf(worker3);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        _submit(toSubmit, worker3, PROOF);
        assertEq(uint8(escrow.getTask(toSubmit).state), uint8(ITaskEscrow.TaskState.Submitted));

        vm.prank(buyer);
        escrow.approve(toSubmit);
        assertEq(usdc.balanceOf(worker3), workerBefore + AMOUNT, "paid while paused");
        assertEq(usdc.balanceOf(treasury), treasuryBefore + FEE);

        vm.prank(worker1);
        escrow.releaseClaim(toReleaseClaim);
        assertEq(uint8(escrow.getTask(toReleaseClaim).state), uint8(ITaskEscrow.TaskState.Open));

        vm.prank(buyer);
        escrow.dispute(toDispute);
        assertEq(uint8(escrow.getTask(toDispute).state), uint8(ITaskEscrow.TaskState.Disputed));

        vm.prank(deployer);
        escrow.resolve(toDispute, false);
        assertEq(uint8(escrow.getTask(toDispute).state), uint8(ITaskEscrow.TaskState.Resolved));

        vm.prank(worker3);
        escrow.autoRelease(toAutoRelease);
        assertEq(uint8(escrow.getTask(toAutoRelease).state), uint8(ITaskEscrow.TaskState.Released));

        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.expire(toExpire);
        assertEq(usdc.balanceOf(buyer), buyerBefore + LOCKED, "refunded while paused");

        // Unpausing puts the two gated paths back.
        vm.prank(deployer);
        escrow.unpause();
        assertEq(_post(), 6);
        _claim(toReleaseClaim, worker1);
        assertEq(escrow.getTask(toReleaseClaim).worker, worker1);
    }
}
