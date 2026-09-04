// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ITaskEscrow} from "../src/interfaces/ITaskEscrow.sol";
import {TaskEscrowBase} from "./TaskEscrow.base.t.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice PR 1/2 of T-12: posting, claiming, releasing a claim, submitting, expiry,
///         lazy expiry, cooldown, pause and the seeded-worker allowlist.
contract TaskEscrowTest is TaskEscrowBase {
    function test_PostAsBuyer_PullsFromSender() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        uint256 relayerBefore = usdc.balanceOf(relayer);

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskPosted(1, buyer, 1207, 1, SPEC_HASH, AMOUNT, FEE, "ez5ku", 1800, 3600, 120);
        vm.prank(buyer);
        uint256 taskId = escrow.postAsBuyer(_params());
        assertEq(taskId, 1);

        assertEq(usdc.balanceOf(buyer), buyerBefore - LOCKED, "the buyer pays 3.45");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + LOCKED, "the escrow locks 3.45");
        assertEq(usdc.balanceOf(relayer), relayerBefore, "the relayer float is untouched");

        ITaskEscrow.Task memory t = escrow.getTask(1);
        assertEq(t.amount, AMOUNT, "the worker's rate is 3.00");
        assertEq(t.fee, FEE, "the fee is 0.45 on top");
        assertEq(uint8(t.state), uint8(ITaskEscrow.TaskState.Open));
        assertEq(t.postedAt, uint64(block.timestamp));
        assertEq(escrow.openTasksOf(buyer), 1);

        ITaskEscrow.PostParams memory p = _params();
        p.buyer = worker1;
        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.NotBuyer.selector);
        escrow.postAsBuyer(p);

        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.NotRelayer.selector);
        escrow.post(_params());

        // The relayed path spends the operator float, but the task still belongs to the payer.
        uint256 relayerBeforeRelayed = usdc.balanceOf(relayer);
        uint256 buyerBeforeRelayed = usdc.balanceOf(buyer);
        assertEq(_post(), 2);
        assertEq(usdc.balanceOf(relayer), relayerBeforeRelayed - LOCKED, "the float pays");
        assertEq(usdc.balanceOf(buyer), buyerBeforeRelayed, "the buyer pays nothing twice");
        assertEq(escrow.getTask(2).buyer, Keys.buyer());
    }

    function test_Post_RevertsOverOpenCap() public {
        for (uint256 i = 0; i < 5; i++) {
            _post();
        }
        assertEq(escrow.openTasksOf(buyer), 5);

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.OverOpenCap.selector);
        escrow.post(_params());

        // The cap is per buyer: one injected agent cannot hold the whole float hostage.
        address otherBuyer = address(0xB0A7);
        ITaskEscrow.PostParams memory p = _params();
        p.buyer = otherBuyer;
        assertEq(_post(p), 6);
        assertEq(escrow.openTasksOf(otherBuyer), 1);

        uint256 postedAt = escrow.getTask(1).postedAt;
        vm.warp(postedAt + 1801);
        escrow.expire(1);
        assertEq(escrow.openTasksOf(buyer), 4);
        assertEq(_post(), 7);
        assertEq(escrow.openTasksOf(buyer), 5);
    }

    function test_Post_RevertsBadParams() public {
        ITaskEscrow.PostParams memory p = _params();

        p.taskType = 3;
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.BadTaskType.selector);
        escrow.post(p);

        p.taskType = 0;
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.BadTaskType.selector);
        escrow.post(p);

        p = _params();
        p.amount = 999_999;
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AmountOutOfRange.selector);
        escrow.post(p);

        p.amount = 10_000_001;
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AmountOutOfRange.selector);
        escrow.post(p);

        p.amount = 10_000_000;
        assertEq(escrow.getTask(_post(p)).fee, 1_500_000, "15% on top of the cap");

        p.amount = 1_000_000;
        assertEq(escrow.getTask(_post(p)).fee, 150_000, "15% on top of the floor");
    }

    function test_Seeded_CannotClaimExternalTask() public {
        uint256 id = _post();

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.SeededCannotClaimExternal.selector);
        escrow.claimFor(id, worker2);

        vm.prank(worker2);
        vm.expectRevert(ITaskEscrow.SeededCannotClaimExternal.selector);
        escrow.claim(id);

        _claim(id, worker1);
        assertEq(escrow.getTask(id).worker, worker1, "a real worker claims it fine");

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.BuyerAllowlisted(buyer, true);
        vm.prank(deployer);
        escrow.setAllowlistedBuyer(buyer, true);

        uint256 relayed = _post();
        _claim(relayed, worker2);
        assertEq(escrow.getTask(relayed).worker, worker2);

        vm.prank(worker2);
        escrow.releaseClaim(relayed);

        uint256 direct = _post();
        vm.prank(worker2);
        escrow.claim(direct);
        assertEq(escrow.getTask(direct).worker, worker2);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        escrow.setAllowlistedBuyer(buyer, false);
    }

    function test_Claim_RevertsBasics() public {
        uint256 id1 = _post();
        uint256 id2 = _post();

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.NotWorker.selector);
        escrow.claimFor(id1, address(0xDEAD));

        _claim(id1, worker1);

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.HasActiveClaim.selector);
        escrow.claimFor(id2, worker1);

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AlreadyClaimed.selector);
        escrow.claimFor(id1, worker3);

        _submit(id1, worker1, keccak256("proof"));
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.claimFor(id1, worker3);

        vm.prank(buyer);
        vm.expectRevert(ITaskEscrow.NotRelayer.selector);
        escrow.claimFor(id2, worker3);

        vm.prank(deployer);
        escrow.pause();

        vm.prank(worker3);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.claim(id2);

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.claimFor(id2, worker3);

        vm.prank(deployer);
        escrow.unpause();
        _claim(id2, worker3);
        assertEq(escrow.getTask(id2).worker, worker3, "unpause restores claiming");
    }

    function test_Claim_LazyExpiry() public {
        uint256 id = _post();
        _claim(id, worker1);
        uint256 t0 = escrow.getTask(id).claimedAt;

        vm.warp(t0 + 1800);
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AlreadyClaimed.selector);
        escrow.claimFor(id, worker3);

        // No keeper exists: the claim that displaces the stale claimant is what retires it.
        vm.warp(t0 + 1801);
        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.ClaimExpired(id, worker1);
        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskClaimed(id, worker3);
        _claim(id, worker3);

        ITaskEscrow.Task memory t = escrow.getTask(id);
        assertEq(t.worker, worker3);
        assertEq(t.claimedAt, uint64(t0 + 1801));
        assertEq(escrow.activeClaimOf(worker1), 0);
        assertEq(escrow.activeClaimOf(worker3), id);
    }

    function test_Claim_CooldownAfterExpiry() public {
        uint256 id = _post();
        uint256 fresh = _post();
        _claim(id, worker1);
        uint256 t0 = escrow.getTask(id).claimedAt;

        vm.warp(t0 + 1801);
        _claim(id, worker3);
        uint256 expiredAt = t0 + 1801;
        assertEq(escrow.cooldownUntil(worker1), expiredAt + 900);

        vm.warp(expiredAt + 899);
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.InCooldown.selector);
        escrow.claimFor(fresh, worker1);

        vm.warp(expiredAt + 900);
        _claim(fresh, worker1);
        assertEq(escrow.getTask(fresh).worker, worker1);

        // Handing a task back inside the TTL is not a failure, so it carries no cooldown.
        vm.prank(worker3);
        escrow.releaseClaim(id);
        assertEq(escrow.cooldownUntil(worker3), 0);
        vm.prank(worker3);
        escrow.claim(id);
        assertEq(escrow.getTask(id).worker, worker3);
    }

    function test_ReleaseClaim_ReopensWithoutCooldown() public {
        uint256 id = _post();
        uint256 stillOpen = _post();
        _claim(id, worker1);
        uint256 openCount = escrow.openTasksOf(buyer);

        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.NotClaimant.selector);
        escrow.releaseClaimFor(id, worker3);

        vm.prank(worker1);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.releaseClaim(stillOpen);

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.ClaimReleased(id, worker1);
        vm.prank(relayer);
        escrow.releaseClaimFor(id, worker1);

        ITaskEscrow.Task memory t = escrow.getTask(id);
        assertEq(uint8(t.state), uint8(ITaskEscrow.TaskState.Open));
        assertEq(t.worker, address(0));
        assertEq(escrow.activeClaimOf(worker1), 0);
        assertEq(escrow.cooldownUntil(worker1), 0);
        assertEq(escrow.openTasksOf(buyer), openCount, "the buyer's task is still open");
    }

    function test_Submit_PathsAndErrors() public {
        uint256 id = _post();
        uint256 stillOpen = _post();
        _claim(id, worker1);
        bytes32 proof = keccak256("proof");

        vm.prank(worker3);
        vm.expectRevert(ITaskEscrow.NotClaimant.selector);
        escrow.submit(id, proof);

        vm.prank(worker3);
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.submit(stillOpen, proof);

        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskSubmitted(id, worker1, proof);
        _submit(id, worker1, proof);

        ITaskEscrow.Task memory t = escrow.getTask(id);
        assertEq(uint8(t.state), uint8(ITaskEscrow.TaskState.Submitted));
        assertEq(t.proofHash, proof);
        assertEq(t.submittedAt, uint64(block.timestamp));
        assertEq(escrow.activeClaimOf(worker1), id, "the claim holds through the dispute window");

        // A stop must never be able to trap work a worker has already done.
        _claim(stillOpen, worker3);
        vm.prank(deployer);
        escrow.pause();
        bytes32 secondProof = keccak256("proof-2");
        vm.prank(worker3);
        escrow.submit(stillOpen, secondProof);
        assertEq(uint8(escrow.getTask(stillOpen).state), uint8(ITaskEscrow.TaskState.Submitted));
    }

    function test_Expire_RefundsBuyer() public {
        // (a) posted, never claimed.
        uint256 id = _post();
        uint256 postedAt = escrow.getTask(id).postedAt;
        uint256 openCount = escrow.openTasksOf(buyer);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        uint256 relayerBefore = usdc.balanceOf(relayer);

        vm.warp(postedAt + 1801);
        vm.expectEmit(true, true, true, true);
        emit ITaskEscrow.TaskRefunded(id, buyer, LOCKED);
        vm.prank(worker3);
        escrow.expire(id);

        // (e) the refund follows p.buyer — the x402 payer — not the float that fronted it.
        assertEq(usdc.balanceOf(buyer), buyerBefore + LOCKED, "the payer is made whole");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - LOCKED);
        assertEq(usdc.balanceOf(relayer), relayerBefore, "never the relayer");
        assertEq(uint8(escrow.getTask(id).state), uint8(ITaskEscrow.TaskState.Refunded));
        assertEq(escrow.openTasksOf(buyer), openCount - 1);

        // (b) claimed, never submitted.
        uint256 claimed = _post();
        _claim(claimed, worker1);
        uint256 claimedAt = escrow.getTask(claimed).claimedAt;
        vm.warp(claimedAt + 3601);
        escrow.expire(claimed);
        assertEq(uint8(escrow.getTask(claimed).state), uint8(ITaskEscrow.TaskState.Refunded));
        assertEq(escrow.activeClaimOf(worker1), 0);
        assertEq(escrow.cooldownUntil(worker1), 0, "expire applies no cooldown");

        // (c) a submitted task is settled, not expired.
        uint256 submitted = _post();
        _claim(submitted, worker3);
        _submit(submitted, worker3, keccak256("proof"));
        vm.expectRevert(ITaskEscrow.BadState.selector);
        escrow.expire(submitted);

        // (d) a stop never traps the refund either.
        uint256 whilePaused = _post();
        uint256 pausedAt = escrow.getTask(whilePaused).postedAt;
        vm.prank(deployer);
        escrow.pause();
        vm.warp(pausedAt + 1801);
        uint256 buyerBeforePaused = usdc.balanceOf(buyer);
        escrow.expire(whilePaused);
        assertEq(usdc.balanceOf(buyer), buyerBeforePaused + LOCKED);
    }

    function test_Boundary_ClaimTTL() public {
        uint256 id = _post();
        _claim(id, worker1);
        uint256 claimedAt = escrow.getTask(id).claimedAt;

        vm.warp(claimedAt + 1799);
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AlreadyClaimed.selector);
        escrow.claimFor(id, worker3);

        vm.warp(claimedAt + 1800);
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.AlreadyClaimed.selector);
        escrow.claimFor(id, worker3);

        vm.warp(claimedAt + 1801);
        _claim(id, worker3);
        assertEq(escrow.getTask(id).worker, worker3);

        uint256 stillOpen = _post();
        uint256 postedAt = escrow.getTask(stillOpen).postedAt;

        vm.warp(postedAt + 1800);
        vm.expectRevert(ITaskEscrow.NotExpired.selector);
        escrow.expire(stillOpen);

        vm.warp(postedAt + 1801);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.expire(stillOpen);
        assertEq(usdc.balanceOf(buyer), buyerBefore + LOCKED);
    }

    function test_Boundary_SubmitTTL() public {
        // Three fresh tasks, three claimants: a claim stays active until the task settles.
        _allowlist(buyer);
        uint256 early = _post();
        uint256 onTime = _post();
        uint256 late = _post();
        _claim(early, worker1);
        _claim(onTime, worker3);
        _claim(late, worker2);
        uint256 claimedAt = escrow.getTask(late).claimedAt;
        bytes32 proof = keccak256("proof");

        vm.warp(claimedAt + 3599);
        _submit(early, worker1, proof);
        assertEq(uint8(escrow.getTask(early).state), uint8(ITaskEscrow.TaskState.Submitted));

        vm.warp(claimedAt + 3600);
        _submit(onTime, worker3, proof);
        assertEq(uint8(escrow.getTask(onTime).state), uint8(ITaskEscrow.TaskState.Submitted));
        vm.expectRevert(ITaskEscrow.NotExpired.selector);
        escrow.expire(late);

        vm.warp(claimedAt + 3601);
        vm.prank(relayer);
        vm.expectRevert(ITaskEscrow.SubmitWindowClosed.selector);
        escrow.submitFor(late, worker2, proof);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.expire(late);
        assertEq(usdc.balanceOf(buyer), buyerBefore + LOCKED);
        assertEq(uint8(escrow.getTask(late).state), uint8(ITaskEscrow.TaskState.Refunded));
    }
}
