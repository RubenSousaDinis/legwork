// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {Reputation} from "../src/Reputation.sol";
import {IReputation} from "../src/interfaces/IReputation.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Worker-side reputation: who may write, one rater one voice, and the nullifier key.
/// @dev No mocks and no money here — `Reputation` makes no external calls, so the only actor
///      besides the owner is the escrow address it is wired to.
contract ReputationTest is Test {
    Reputation internal rep;

    address internal deployer = Keys.deployer();
    address internal relayer = Keys.relayer();
    address internal signer = Keys.signer();
    address internal worker3 = Keys.worker3();
    address internal escrowAddr = makeAddr("escrow");

    uint256 internal constant ALICE = 0xA11CE;
    uint256 internal constant BOB = 0xB0B;

    bytes32 internal rA = bytes32(uint256(1207));
    bytes32 internal rB = bytes32(uint256(uint160(Keys.worker3())));

    function setUp() public {
        vm.warp(1_757_000_000);
        rep = new Reputation(deployer);
    }

    function _wireEscrow() private {
        vm.prank(deployer);
        rep.setEscrow(escrowAddr);
    }

    function test_Feedback_OnlyEscrow() public {
        // escrow starts at address(0): nobody can write, not even the future escrow.
        assertEq(rep.escrow(), address(0));

        vm.prank(escrowAddr);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 1);

        vm.prank(signer);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 1);

        vm.prank(deployer);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 1);

        // wiring the escrow is the owner's alone.
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        rep.setEscrow(escrowAddr);

        _wireEscrow();
        assertEq(rep.escrow(), escrowAddr);

        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 1, 1);
        assertEq(rep.slotOf(ALICE, rA), 1);

        vm.prank(signer);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 2);

        vm.prank(relayer);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 2);

        vm.prank(deployer);
        vm.expectRevert(IReputation.NotEscrow.selector);
        rep.feedback(ALICE, rA, 1, 2);

        // the three outcome codes are the whole vocabulary.
        vm.prank(escrowAddr);
        vm.expectRevert(IReputation.BadOutcome.selector);
        rep.feedback(ALICE, rA, 0, 2);

        vm.prank(escrowAddr);
        vm.expectRevert(IReputation.BadOutcome.selector);
        rep.feedback(ALICE, rA, 4, 2);
    }

    function test_Feedback_DedupPerRater() public {
        _wireEscrow();

        // first write from rater A: a new voice.
        vm.expectEmit(true, true, true, true);
        emit IReputation.Feedback(ALICE, rA, 1, 1, true);
        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 1, 1);

        assertEq(rep.score(ALICE), 1);
        assertEq(rep.completed(ALICE), 1);
        assertEq(rep.distinctRaters(ALICE), 1);
        assertEq(rep.slotOf(ALICE, rA), 1);

        // second task from the same rater: another completed task, still one voice.
        vm.expectEmit(true, true, true, true);
        emit IReputation.Feedback(ALICE, rA, 1, 2, false);
        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 1, 2);

        assertEq(rep.score(ALICE), 1);
        assertEq(rep.completed(ALICE), 2);
        assertEq(rep.distinctRaters(ALICE), 1);

        // the same rater turns negative: the slot is overwritten, so the score moves by 2.
        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 3, 3);

        assertEq(rep.score(ALICE), -1);
        assertEq(rep.completed(ALICE), 2);
        assertEq(rep.distinctRaters(ALICE), 1);
        assertEq(rep.slotOf(ALICE, rA), 3);

        // a second rater is a second voice.
        vm.prank(escrowAddr);
        rep.feedback(ALICE, rB, 2, 4);

        assertEq(rep.score(ALICE), 0);
        assertEq(rep.completed(ALICE), 3);
        assertEq(rep.distinctRaters(ALICE), 2);
        assertEq(rep.slotOf(ALICE, rB), 2);
    }

    function test_Feedback_NullifierKeyed() public {
        _wireEscrow();

        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 1, 1);
        vm.prank(escrowAddr);
        rep.feedback(ALICE, rA, 1, 2);

        // the same rater key against a second nullifier is a separate record.
        vm.recordLogs();
        vm.prank(escrowAddr);
        rep.feedback(BOB, rA, 3, 3);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(rep));
        assertEq(logs[0].topics[0], keccak256("Feedback(uint256,bytes32,uint8,uint256,bool)"));
        // the nullifier is the first indexed topic: there is no address parameter to key on.
        assertEq(logs[0].topics[1], bytes32(BOB));
        assertEq(logs[0].topics[2], rA);

        assertEq(rep.score(ALICE), 1);
        assertEq(rep.completed(ALICE), 2);
        assertEq(rep.distinctRaters(ALICE), 1);
        assertEq(rep.slotOf(ALICE, rA), 1);

        assertEq(rep.score(BOB), -1);
        assertEq(rep.completed(BOB), 0);
        assertEq(rep.distinctRaters(BOB), 1);
        assertEq(rep.slotOf(BOB, rA), 3);
        assertEq(rep.slotOf(BOB, rB), 0);

        // and a write against BOB leaves ALICE alone in the other direction too.
        vm.prank(escrowAddr);
        rep.feedback(BOB, rB, 1, 4);

        assertEq(rep.score(BOB), 0);
        assertEq(rep.completed(BOB), 1);
        assertEq(rep.distinctRaters(BOB), 2);
        assertEq(rep.score(ALICE), 1);
        assertEq(rep.distinctRaters(ALICE), 1);
    }
}
