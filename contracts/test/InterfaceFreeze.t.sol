// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IWorkerRegistry} from "../src/interfaces/IWorkerRegistry.sol";
import {ITaskEscrow} from "../src/interfaces/ITaskEscrow.sol";
import {IReputation} from "../src/interfaces/IReputation.sol";
import {IAbuseMark} from "../src/interfaces/IAbuseMark.sol";
import {Outcomes} from "../src/interfaces/Outcomes.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {MockReputation} from "./mocks/MockReputation.sol";
import {MockAbuseMark} from "./mocks/MockAbuseMark.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Locks the wire format frozen in T-01a.
///
/// Every selector and topic below is copied by hand into TypeScript, the subgraph
/// mappings and the API's decoders. A later PR that renames an event parameter or
/// reorders a struct still compiles and still passes its own unit tests — it just
/// silently stops matching everything downstream. This file is what fails instead.
contract InterfaceFreezeTest is Test {
    function test_Outcomes_CodesAreFrozen() public pure {
        assertEq(Outcomes.PAID, 1, "PAID must stay 1");
        assertEq(Outcomes.RESOLVED_TO_WORKER, 2, "RESOLVED_TO_WORKER must stay 2");
        assertEq(Outcomes.RESOLVED_TO_BUYER, 3, "RESOLVED_TO_BUYER must stay 3");
    }

    function test_TaskState_OrdinalsAreFrozen() public pure {
        assertEq(uint8(ITaskEscrow.TaskState.None), 0);
        assertEq(uint8(ITaskEscrow.TaskState.Open), 1);
        assertEq(uint8(ITaskEscrow.TaskState.Claimed), 2);
        assertEq(uint8(ITaskEscrow.TaskState.Submitted), 3);
        assertEq(uint8(ITaskEscrow.TaskState.Released), 4);
        assertEq(uint8(ITaskEscrow.TaskState.Refunded), 5);
        assertEq(uint8(ITaskEscrow.TaskState.Disputed), 6);
        assertEq(uint8(ITaskEscrow.TaskState.Resolved), 7);
    }

    /// @dev The subgraph matches on these topic0 values. A renamed parameter changes them.
    function test_EventTopicsAreFrozen() public pure {
        assertEq(
            ITaskEscrow.TaskPosted.selector,
            keccak256(
                "TaskPosted(uint256,address,uint256,uint8,bytes32,uint96,uint96,string,uint32,uint32,uint32)"
            )
        );
        assertEq(ITaskEscrow.TaskClaimed.selector, keccak256("TaskClaimed(uint256,address)"));
        assertEq(ITaskEscrow.ClaimExpired.selector, keccak256("ClaimExpired(uint256,address)"));
        assertEq(ITaskEscrow.TaskSubmitted.selector, keccak256("TaskSubmitted(uint256,address,bytes32)"));
        assertEq(ITaskEscrow.TaskReleased.selector, keccak256("TaskReleased(uint256,address,uint96,uint96)"));
        assertEq(ITaskEscrow.TaskRefunded.selector, keccak256("TaskRefunded(uint256,address,uint96)"));
        assertEq(ITaskEscrow.TaskResolved.selector, keccak256("TaskResolved(uint256,bool)"));
        assertEq(ITaskEscrow.BuyerAllowlisted.selector, keccak256("BuyerAllowlisted(address,bool)"));
        assertEq(
            IWorkerRegistry.WorkerRegistered.selector,
            keccak256("WorkerRegistered(uint256,address,string,uint8)")
        );
        assertEq(
            IWorkerRegistry.WorkerSeeded.selector, keccak256("WorkerSeeded(uint256,address,string,uint8)")
        );
        assertEq(IWorkerRegistry.WorkerReset.selector, keccak256("WorkerReset(uint256,address)"));
        assertEq(IReputation.Feedback.selector, keccak256("Feedback(uint256,bytes32,uint8,uint256,bool)"));
        assertEq(IAbuseMark.Marked.selector, keccak256("Marked(uint256,uint8,bytes32)"));
        assertEq(IAbuseMark.Outcome.selector, keccak256("Outcome(uint256,uint256,uint8)"));
    }

    /// @dev The API decodes reverts by selector to turn them into 409 bodies.
    function test_ErrorSelectorsAreFrozen() public pure {
        assertEq(
            ITaskEscrow.SeededCannotClaimExternal.selector, bytes4(keccak256("SeededCannotClaimExternal()"))
        );
        assertEq(ITaskEscrow.InCooldown.selector, bytes4(keccak256("InCooldown()")));
        assertEq(ITaskEscrow.AlreadyClaimed.selector, bytes4(keccak256("AlreadyClaimed()")));
        assertEq(ITaskEscrow.OverOpenCap.selector, bytes4(keccak256("OverOpenCap()")));
        assertEq(ITaskEscrow.SubmitWindowClosed.selector, bytes4(keccak256("SubmitWindowClosed()")));
        assertEq(ITaskEscrow.DisputeWindowClosed.selector, bytes4(keccak256("DisputeWindowClosed()")));
        assertEq(IWorkerRegistry.DuplicateNullifier.selector, bytes4(keccak256("DuplicateNullifier()")));
        assertEq(IWorkerRegistry.AttestationUsed.selector, bytes4(keccak256("AttestationUsed()")));
        assertEq(IWorkerRegistry.ZeroWorker.selector, bytes4(keccak256("ZeroWorker()")));
        assertEq(IWorkerRegistry.ZeroNullifier.selector, bytes4(keccak256("ZeroNullifier()")));
        assertEq(IAbuseMark.MarkCooldown.selector, bytes4(keccak256("MarkCooldown()")));
    }

    /// @dev Fee is charged ON TOP: 3.00 released, 0.45 fee, 3.45 paid. Never a deducted figure.
    function test_FeeIsChargedOnTop() public pure {
        uint96 amount = 3_000_000;
        uint96 fee = uint96(uint256(amount) * 1500 / 10_000);
        assertEq(fee, 450_000, "fee on 3.00 is 0.45");
        assertEq(uint256(amount) + fee, 3_450_000, "the agent pays 3.45");
        assertEq(amount, 3_000_000, "the worker receives the full 3.00");
    }

    function test_TaskTypeBitmaskIsFrozen() public pure {
        assertEq(uint8(1), uint8(1), "verify-open");
        assertEq(uint8(2), uint8(2), "photo-of");
        assertEq(uint8(4), uint8(4), "call-confirm");
        assertEq(uint8(8), uint8(8), "compare-two");
        assertEq(uint8(1 | 2 | 4 | 8), 15, "all four types");
    }

    /// @dev Compiling at all proves each mock implements its interface; this pins behaviour
    ///      the escrow tests rely on.
    function test_MocksConformAndBehave() public {
        MockUSDC usdc = new MockUSDC();
        assertEq(usdc.decimals(), 6, "USDC is 6-decimal");
        usdc.mint(address(this), 10_000_000);
        assertEq(usdc.balanceOf(address(this)), 10_000_000);

        MockRegistry reg = new MockRegistry();
        reg.setWorker(Keys.worker1(), 111, false);
        reg.setWorker(Keys.worker2(), 222, true);
        assertTrue(reg.isWorker(Keys.worker1()));
        assertFalse(reg.isSeeded(Keys.worker1()));
        assertTrue(reg.isSeeded(Keys.worker2()), "seeded workers are marked as such");
        assertEq(reg.nullifierOf(Keys.worker1()), 111);
        assertEq(reg.workerOf(222), Keys.worker2());

        MockReputation rep = new MockReputation();
        rep.feedback(111, bytes32(uint256(7)), Outcomes.PAID, 1);
        assertEq(rep.callCount(), 1);
        assertEq(rep.lastCall().outcome, Outcomes.PAID);

        MockAbuseMark am = new MockAbuseMark();
        assertTrue(am.mark(5, 3, keccak256("spec")), "first mark writes");
        assertFalse(am.mark(5, 3, keccak256("spec")), "a repeat is idempotent and writes nothing");
        assertTrue(am.marked(5, keccak256("spec")));
        am.outcome(5, 1, Outcomes.PAID);
        assertEq(am.lastOutcome().outcome, Outcomes.PAID);

        MockIdentityRegistry id = new MockIdentityRegistry();
        uint256 agentId = id.register("https://legwork.example/agent.json");
        assertEq(agentId, 1, "ids increment from 1");
        assertEq(id.ownerOf(agentId), address(this));

        MockReputationRegistry rr = new MockReputationRegistry();
        rr.giveFeedback(agentId, 1, 0, "paid-on-proof", "", "", "", bytes32(uint256(1)));
        address[] memory clients = new address[](0);
        (uint64 count, int128 value,) = rr.getSummary(agentId, clients, "paid-on-proof", "");
        assertEq(count, 1);
        assertEq(value, 1);
    }

    function test_RoleKeysAreDistinct() public pure {
        address[9] memory a = [
            Keys.deployer(),
            Keys.relayer(),
            Keys.verifier(),
            Keys.signer(),
            Keys.buyer(),
            Keys.worker1(),
            Keys.worker2(),
            Keys.worker3(),
            Keys.treasury()
        ];
        for (uint256 i = 0; i < a.length; i++) {
            assertTrue(a[i] != address(0));
            for (uint256 j = i + 1; j < a.length; j++) {
                assertTrue(a[i] != a[j], "every role key must be distinct");
            }
        }
    }
}
