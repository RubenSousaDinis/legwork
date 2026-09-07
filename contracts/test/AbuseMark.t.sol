// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {AbuseMark} from "../src/AbuseMark.sol";
import {IAbuseMark} from "../src/interfaces/IAbuseMark.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice The agent-side writer: who may mark, idempotency, the rolling rate limit, and the
///         eight arguments that reach the ERC-8004 ReputationRegistry.
/// @dev The two registries are the mocks from `test/mocks/MockERC8004.sol` — C-class, so no RPC
///      and no live registry.
contract AbuseMarkTest is Test {
    AbuseMark internal am;
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;

    address internal deployer = Keys.deployer();
    address internal relayer = Keys.relayer();
    address internal signer = Keys.signer();
    address internal worker3 = Keys.worker3();
    address internal escrowAddr = makeAddr("escrow");

    uint256 internal constant AGENT = 1207;
    /// @dev The suite's fixed start time. Held as a constant rather than a local read of
    ///      `block.timestamp`: under `--ir-minimum` the compiler may rematerialise TIMESTAMP, so a
    ///      cached local would follow `vm.warp` instead of pinning the window's origin.
    uint256 internal constant T0 = 1_757_000_000;
    string internal constant AGENT_URI = "data:application/json,{\"name\":\"Legwork Task API\"}";

    bytes32 internal h1 = keccak256("spec-one");
    bytes32 internal h2 = keccak256("spec-two");
    bytes32 internal h3 = keccak256("spec-three");

    function setUp() public {
        vm.warp(T0);
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        am = new AbuseMark(deployer, signer, address(identity), address(reputation));
    }

    function _wireEscrow() private {
        vm.prank(deployer);
        am.setEscrow(escrowAddr);
    }

    /// @dev How many of the recorded logs came from AbuseMark itself.
    function _logsFrom(Vm.Log[] memory logs, address emitter) private pure returns (uint256 n) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == emitter) n++;
        }
    }

    function test_Mark_OnlySigner() public {
        vm.prank(deployer);
        vm.expectRevert(IAbuseMark.NotSigner.selector);
        am.mark(AGENT, 1, h1);

        vm.prank(relayer);
        vm.expectRevert(IAbuseMark.NotSigner.selector);
        am.mark(AGENT, 1, h1);

        vm.prank(escrowAddr);
        vm.expectRevert(IAbuseMark.NotSigner.selector);
        am.mark(AGENT, 1, h1);

        vm.prank(signer);
        bool written = am.mark(AGENT, 1, h1);
        assertTrue(written);

        // rotating the signer key retires the old one.
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        am.setSigner(worker3);

        vm.prank(deployer);
        am.setSigner(worker3);
        assertEq(am.signer(), worker3);

        vm.warp(block.timestamp + 86400);

        vm.prank(signer);
        vm.expectRevert(IAbuseMark.NotSigner.selector);
        am.mark(AGENT, 1, h2);

        vm.prank(worker3);
        assertTrue(am.mark(AGENT, 1, h2));
    }

    function test_Mark_BadClass() public {
        vm.prank(signer);
        vm.expectRevert(IAbuseMark.BadClass.selector);
        am.mark(AGENT, 0, h1);

        vm.prank(signer);
        vm.expectRevert(IAbuseMark.BadClass.selector);
        am.mark(AGENT, 7, h1);

        vm.expectRevert(IAbuseMark.BadClass.selector);
        am.classLabel(0);

        vm.expectRevert(IAbuseMark.BadClass.selector);
        am.classLabel(7);

        // the six labels are the paper's own, verbatim and in id order.
        assertEq(am.classLabel(1), "credential fraud");
        assertEq(am.classLabel(2), "identity impersonation");
        assertEq(am.classLabel(3), "automated reconnaissance");
        assertEq(am.classLabel(4), "social media manipulation");
        assertEq(am.classLabel(5), "authentication circumvention");
        assertEq(am.classLabel(6), "referral fraud");

        // nothing was written by any of the above.
        assertEq(reputation.callCount(), 0);
        assertEq(am.marksOf(AGENT), 0);
    }

    function test_Mark_Idempotent() public {
        vm.expectEmit(true, true, true, true);
        emit IAbuseMark.Marked(AGENT, 3, h1);
        vm.prank(signer);
        bool written = am.mark(AGENT, 3, h1);

        assertTrue(written);
        assertTrue(am.marked(AGENT, h1));
        assertEq(am.marksOf(AGENT), 1);
        assertEq(reputation.callCount(), 1);

        uint256 markedAt = am.lastMarkAt(AGENT);
        assertEq(markedAt, block.timestamp);

        vm.warp(block.timestamp + 86400);

        // a retry of the same refusal: false, no write, no event, no registry call.
        vm.recordLogs();
        vm.prank(signer);
        bool repeat = am.mark(AGENT, 3, h1);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(repeat);
        assertEq(_logsFrom(logs, address(am)), 0);
        assertEq(am.marksOf(AGENT), 1);
        assertEq(reputation.callCount(), 1);
        assertEq(am.lastMarkAt(AGENT), markedAt);

        // the same spec under another class is still the same refusal.
        vm.recordLogs();
        vm.prank(signer);
        bool otherClass = am.mark(AGENT, 5, h1);
        Vm.Log[] memory logs2 = vm.getRecordedLogs();

        assertFalse(otherClass);
        assertEq(_logsFrom(logs2, address(am)), 0);
        assertEq(am.marksOf(AGENT), 1);
        assertEq(reputation.callCount(), 1);
        assertEq(am.lastMarkAt(AGENT), markedAt);

        // a different spec is a different refusal.
        vm.prank(signer);
        assertTrue(am.mark(AGENT, 3, h2));
        assertEq(am.marksOf(AGENT), 2);
        assertEq(reputation.callCount(), 2);
        assertEq(am.lastMarkAt(AGENT), block.timestamp);
    }

    function test_Mark_RateLimited() public {
        assertEq(am.markCooldown(), 86400);

        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        am.setMarkCooldown(120);

        vm.prank(deployer);
        am.setMarkCooldown(120);
        assertEq(am.markCooldown(), 120);

        vm.prank(signer);
        assertTrue(am.mark(AGENT, 1, h1));

        vm.warp(T0 + 119);
        vm.prank(signer);
        vm.expectRevert(IAbuseMark.MarkCooldown.selector);
        am.mark(AGENT, 2, h2);

        vm.warp(T0 + 120);
        vm.prank(signer);
        assertTrue(am.mark(AGENT, 2, h2));

        // the window rolls from the second mark, not from the first.
        vm.warp(T0 + 239);
        vm.prank(signer);
        vm.expectRevert(IAbuseMark.MarkCooldown.selector);
        am.mark(AGENT, 4, h3);

        vm.warp(T0 + 240);
        vm.prank(signer);
        assertTrue(am.mark(AGENT, 4, h3));
        assertEq(am.marksOf(AGENT), 3);

        // the limit is per agent: another agent is unaffected by this one's window.
        vm.prank(signer);
        assertTrue(am.mark(99, 1, h1));
        assertEq(am.marksOf(99), 1);
    }

    function test_Mark_WritesGiveFeedback() public {
        string[6] memory labels = [
            "credential fraud",
            "identity impersonation",
            "automated reconnaissance",
            "social media manipulation",
            "authentication circumvention",
            "referral fraud"
        ];

        for (uint8 classId = 1; classId <= 6; classId++) {
            bytes32 specHash = keccak256(abi.encodePacked("spec", classId));

            vm.warp(block.timestamp + 86400);
            vm.prank(signer);
            assertTrue(am.mark(AGENT, classId, specHash));

            MockReputationRegistry.FeedbackCall memory c = reputation.lastCall();
            assertEq(c.agentId, AGENT);
            assertEq(c.value, int128(-1));
            assertEq(c.valueDecimals, 0);
            assertEq(c.tag1, "task-refused");
            assertEq(c.tag2, labels[classId - 1]);
            assertEq(c.tag2, am.classLabel(classId));
            assertEq(c.endpoint, "");
            assertEq(c.feedbackURI, "");
            assertEq(c.feedbackHash, specHash);
            assertEq(c.client, address(am));
        }

        assertEq(reputation.callCount(), 6);
        assertEq(am.marksOf(AGENT), 6);
    }

    function test_Outcome_OnlyEscrow() public {
        assertEq(am.escrow(), address(0));

        vm.prank(signer);
        vm.expectRevert(IAbuseMark.NotEscrow.selector);
        am.outcome(AGENT, 7, 1);

        vm.prank(deployer);
        vm.expectRevert(IAbuseMark.NotEscrow.selector);
        am.outcome(AGENT, 7, 1);

        _wireEscrow();

        // 1 Paid: released on proof.
        vm.expectEmit(true, true, true, true);
        emit IAbuseMark.Outcome(AGENT, 7, 1);
        vm.prank(escrowAddr);
        am.outcome(AGENT, 7, 1);

        MockReputationRegistry.FeedbackCall memory c = reputation.lastCall();
        assertEq(c.agentId, AGENT);
        assertEq(c.value, int128(1));
        assertEq(c.valueDecimals, 0);
        assertEq(c.tag1, "paid-on-proof");
        assertEq(c.tag2, "");
        assertEq(c.endpoint, "");
        assertEq(c.feedbackURI, "");
        assertEq(c.feedbackHash, bytes32(uint256(7)));

        // 2 ResolvedToWorker: the agent's dispute was rejected.
        vm.prank(escrowAddr);
        am.outcome(AGENT, 7, 2);
        c = reputation.lastCall();
        assertEq(c.value, int128(-1));
        assertEq(c.tag1, "disputed");
        assertEq(c.feedbackHash, bytes32(uint256(7)));

        // 3 ResolvedToBuyer: the agent's dispute was upheld.
        vm.prank(escrowAddr);
        am.outcome(AGENT, 7, 3);
        c = reputation.lastCall();
        assertEq(c.value, int128(1));
        assertEq(c.tag1, "disputed");

        vm.prank(escrowAddr);
        vm.expectRevert(IAbuseMark.BadOutcome.selector);
        am.outcome(AGENT, 7, 0);

        vm.prank(escrowAddr);
        vm.expectRevert(IAbuseMark.BadOutcome.selector);
        am.outcome(AGENT, 7, 4);

        // settlement feedback writes no storage here.
        assertEq(reputation.callCount(), 3);
        assertEq(am.marksOf(AGENT), 0);
        assertEq(am.lastMarkAt(AGENT), 0);
        assertFalse(am.marked(AGENT, h1));
    }

    function test_RegisterIdentity_HoldsAgentId() public {
        assertEq(am.selfAgentId(), 0);

        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        am.registerIdentity(AGENT_URI);

        uint256 expected = identity.nextId();
        vm.prank(deployer);
        uint256 id = am.registerIdentity(AGENT_URI);

        assertEq(id, expected);
        assertEq(am.selfAgentId(), id);
        assertEq(identity.uriOf(id), AGENT_URI);
        assertEq(identity.ownerOf(id), address(am));

        // the identity is held once and never re-registered.
        vm.prank(deployer);
        vm.expectRevert(IAbuseMark.IdentityAlreadyRegistered.selector);
        am.registerIdentity(AGENT_URI);
        assertEq(am.selfAgentId(), id);
    }
}
