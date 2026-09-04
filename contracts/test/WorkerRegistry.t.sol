// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {WorkerRegistry} from "../src/WorkerRegistry.sol";
import {IWorkerRegistry} from "../src/interfaces/IWorkerRegistry.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Unit tests for the ATTESTED registration path, the seeded demo path, the operator
///         reset and the O(1) views.
/// @dev    The EIP-712 domain separator and the struct hash are rebuilt here from the four domain
///         fields and the type string, by hand. Nothing in this file asks the contract what its
///         domain is: a test that read `eip712Domain()` would mirror a wrong domain instead of
///         catching it, and the same digest is what the TypeScript signer in T-20 has to produce.
contract WorkerRegistryTest is Test {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant EXPECTED_ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)"
    );

    uint256 internal constant CHAIN_ID = 84532;
    uint256 internal constant START_TIME = 1_757_000_000;

    uint256 internal constant NULLIFIER = 0xA11CE;
    string internal constant AREA = "ez5ku";
    uint8 internal constant TASK_TYPES = 15;

    uint256 internal constant SEED_NULLIFIER = 0x5EED;
    string internal constant SEED_AREA = "ez5kv";
    uint8 internal constant SEED_TASK_TYPES = 3;

    uint256 internal constant MAX_VIEW_GAS = 15_000;

    WorkerRegistry internal registry;
    uint256 internal deadline;
    bytes internal defaultAttestation;

    function setUp() public {
        vm.chainId(CHAIN_ID);
        vm.warp(START_TIME);
        vm.prank(Keys.deployer());
        registry = new WorkerRegistry(Keys.deployer(), Keys.relayer(), Keys.verifier());
        deadline = block.timestamp + 600;
        defaultAttestation = _attest(
            NULLIFIER,
            Keys.worker1(),
            AREA,
            TASK_TYPES,
            deadline,
            Keys.VERIFIER_PK,
            CHAIN_ID,
            address(registry)
        );
    }

    // --------------------------------------------------------------------- helpers

    /// @dev The domain separator, built from the four fields the contract commits to.
    function _domainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Legwork WorkerRegistry")),
                keccak256(bytes("1")),
                chainId,
                verifyingContract
            )
        );
    }

    function _digest(
        uint256 nullifier,
        address worker,
        string memory area,
        uint8 taskTypes,
        uint256 deadline_,
        uint256 chainId,
        address verifyingContract
    ) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                EXPECTED_ATTESTATION_TYPEHASH, nullifier, worker, keccak256(bytes(area)), taskTypes, deadline_
            )
        );
        return
            keccak256(abi.encodePacked(hex"1901", _domainSeparator(chainId, verifyingContract), structHash));
    }

    /// @dev Produces the 65-byte attestation the relayer forwards. `signerKey`, `chainId` and
    ///      `verifyingContract` are parameters so a test can sign under a deliberately wrong
    ///      domain or with the wrong key.
    function _attest(
        uint256 nullifier,
        address worker,
        string memory area,
        uint8 taskTypes,
        uint256 deadline_,
        uint256 signerKey,
        uint256 chainId,
        address verifyingContract
    ) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerKey, _digest(nullifier, worker, area, taskTypes, deadline_, chainId, verifyingContract)
        );
        return abi.encodePacked(r, s, v);
    }

    /// @dev A well-formed attestation from the verifier key under the live domain.
    function _goodAttest(
        uint256 nullifier,
        address worker,
        string memory area,
        uint8 taskTypes,
        uint256 deadline_
    ) internal view returns (bytes memory) {
        return _attest(
            nullifier, worker, area, taskTypes, deadline_, Keys.VERIFIER_PK, CHAIN_ID, address(registry)
        );
    }

    function _registerDefault() internal {
        vm.prank(Keys.relayer());
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);
    }

    function _assertUnbound(address worker, uint256 nullifier) internal view {
        assertFalse(registry.isWorker(worker), "isWorker must be false");
        assertFalse(registry.isSeeded(worker), "isSeeded must be false");
        assertEq(registry.nullifierOf(worker), 0, "nullifierOf must be 0");
        assertEq(registry.areaOf(worker), "", "areaOf must be empty");
        assertEq(registry.taskTypesOf(worker), 0, "taskTypesOf must be 0");
        assertEq(registry.workerOf(nullifier), address(0), "workerOf must be the zero address");
    }

    // --------------------------------------------------------------------- typehash

    function test_TypehashMatchesTheTypeString() public view {
        assertEq(
            registry.ATTESTATION_TYPEHASH(),
            EXPECTED_ATTESTATION_TYPEHASH,
            "ATTESTATION_TYPEHASH must hash the frozen type string; T-20 mirrors it in TypeScript"
        );
    }

    // --------------------------------------------------------------------- §8 tests

    function test_Register_DuplicateNullifierReverts() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit IWorkerRegistry.WorkerRegistered(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES);
        _registerDefault();

        assertTrue(registry.isWorker(Keys.worker1()));
        assertFalse(registry.isSeeded(Keys.worker1()));

        // Same human, a second payout address: a fresh attestation, so the digest is new and the
        // nullifier check is what stops it.
        bytes memory forWorker2 = _goodAttest(NULLIFIER, Keys.worker2(), AREA, TASK_TYPES, deadline);
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.DuplicateNullifier.selector);
        registry.registerFor(NULLIFIER, Keys.worker2(), AREA, TASK_TYPES, deadline, forWorker2);

        // A second human onto an address that is already bound.
        uint256 otherNullifier = 0xB0B;
        bytes memory forWorker1Again = _goodAttest(otherNullifier, Keys.worker1(), AREA, TASK_TYPES, deadline);
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.WorkerAlreadyBound.selector);
        registry.registerFor(otherNullifier, Keys.worker1(), AREA, TASK_TYPES, deadline, forWorker1Again);

        // The seeding path answers with the same two errors.
        vm.prank(Keys.deployer());
        vm.expectRevert(IWorkerRegistry.DuplicateNullifier.selector);
        registry.seedWorker(Keys.worker3(), NULLIFIER, SEED_AREA, SEED_TASK_TYPES);

        vm.prank(Keys.deployer());
        vm.expectRevert(IWorkerRegistry.WorkerAlreadyBound.selector);
        registry.seedWorker(Keys.worker1(), SEED_NULLIFIER, SEED_AREA, SEED_TASK_TYPES);
    }

    function test_Register_ReplayedAttestationReverts() public {
        // (a) the same bytes twice: AttestationUsed fires before DuplicateNullifier.
        _registerDefault();
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.AttestationUsed.selector);
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);

        // (b) signed for another chain.
        bytes memory wrongChain = _attest(
            0xB0B,
            Keys.worker2(),
            AREA,
            TASK_TYPES,
            deadline,
            Keys.VERIFIER_PK,
            CHAIN_ID + 1,
            address(registry)
        );
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.BadAttestation.selector);
        registry.registerFor(0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, wrongChain);

        // (c) signed for worker1, submitted for worker2 — the binding is inside the digest.
        bytes memory forWorker1 = _goodAttest(0xB0B, Keys.worker1(), AREA, TASK_TYPES, deadline);
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.BadAttestation.selector);
        registry.registerFor(0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, forWorker1);

        // (d) signed by the relayer key instead of the attestation verifier key.
        bytes memory wrongSigner = _attest(
            0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, Keys.RELAYER_PK, CHAIN_ID, address(registry)
        );
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.BadAttestation.selector);
        registry.registerFor(0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, wrongSigner);

        // (e) signed for a different verifying contract.
        bytes memory wrongContract = _attest(
            0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, Keys.VERIFIER_PK, CHAIN_ID, address(0xdead)
        );
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.BadAttestation.selector);
        registry.registerFor(0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, wrongContract);

        // (d) again, from the other side: point the contract at the relayer key and the very same
        // bytes now register. BadAttestation was about who signed, not about the encoding.
        vm.prank(Keys.deployer());
        registry.setAttestationVerifier(Keys.relayer());
        assertEq(registry.attestationVerifier(), Keys.relayer());
        vm.prank(Keys.relayer());
        registry.registerFor(0xB0B, Keys.worker2(), AREA, TASK_TYPES, deadline, wrongSigner);
        assertTrue(registry.isWorker(Keys.worker2()));
    }

    function test_Register_ExpiredAttestationReverts() public {
        // The boundary is `>`: at exactly the deadline the attestation is still good.
        vm.warp(deadline);
        _registerDefault();
        assertTrue(registry.isWorker(Keys.worker1()));

        uint256 lateNullifier = 0xB0B;
        bytes memory late = _goodAttest(lateNullifier, Keys.worker2(), AREA, TASK_TYPES, deadline);
        bytes32 lateDigest =
            _digest(lateNullifier, Keys.worker2(), AREA, TASK_TYPES, deadline, CHAIN_ID, address(registry));

        vm.warp(deadline + 1);
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.AttestationExpired.selector);
        registry.registerFor(lateNullifier, Keys.worker2(), AREA, TASK_TYPES, deadline, late);

        // The deadline check runs before the digest is marked, so an expired attestation is not
        // burned by the attempt.
        assertFalse(registry.usedDigest(lateDigest), "an expired attestation must not be marked used");
        _assertUnbound(Keys.worker2(), lateNullifier);
    }

    function test_Register_OnlyRelayer() public {
        address[3] memory impostors = [Keys.deployer(), Keys.verifier(), Keys.worker1()];
        for (uint256 i = 0; i < impostors.length; i++) {
            vm.prank(impostors[i]);
            vm.expectRevert(IWorkerRegistry.NotRelayer.selector);
            registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);
        }

        vm.prank(Keys.worker1());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, Keys.worker1()));
        registry.setRelayer(Keys.worker3());

        vm.prank(Keys.deployer());
        registry.setRelayer(Keys.worker3());
        assertEq(registry.relayer(), Keys.worker3());

        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.NotRelayer.selector);
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);

        vm.prank(Keys.worker3());
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);
        assertTrue(registry.isWorker(Keys.worker1()));
    }

    function test_Register_ZeroWorkerReverts() public {
        uint256 n = 7;
        bytes memory toTheSentinel = _goodAttest(n, address(0), AREA, TASK_TYPES, deadline);

        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.ZeroWorker.selector);
        registry.registerFor(n, address(0), AREA, TASK_TYPES, deadline, toTheSentinel);

        // The guard runs before the relayer check, so the wrong caller does not mask it.
        vm.prank(Keys.worker1());
        vm.expectRevert(IWorkerRegistry.ZeroWorker.selector);
        registry.registerFor(n, address(0), AREA, TASK_TYPES, deadline, toTheSentinel);

        // The revert alone is not the point. `workerOf` reads address(0) as "not bound", so a
        // stored sentinel would read back unbound and let the same human take a second account.
        // The invariant holds only if `n` is still free and still binds exactly once.
        _assertUnbound(address(0), n);

        bytes memory forWorker1 = _goodAttest(n, Keys.worker1(), AREA, TASK_TYPES, deadline);
        vm.prank(Keys.relayer());
        registry.registerFor(n, Keys.worker1(), AREA, TASK_TYPES, deadline, forWorker1);
        assertEq(registry.workerOf(n), Keys.worker1(), "the nullifier binds to the real address");

        bytes memory forWorker2 = _goodAttest(n, Keys.worker2(), AREA, TASK_TYPES, deadline);
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.DuplicateNullifier.selector);
        registry.registerFor(n, Keys.worker2(), AREA, TASK_TYPES, deadline, forWorker2);
        assertFalse(registry.isWorker(Keys.worker2()), "one human, one account");

        // The seeding path refuses the sentinel too.
        vm.prank(Keys.deployer());
        vm.expectRevert(IWorkerRegistry.ZeroWorker.selector);
        registry.seedWorker(address(0), SEED_NULLIFIER, SEED_AREA, SEED_TASK_TYPES);
    }

    function test_Register_ZeroNullifierReverts() public {
        bytes memory noNullifier = _goodAttest(0, Keys.worker1(), AREA, TASK_TYPES, deadline);

        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.ZeroNullifier.selector);
        registry.registerFor(0, Keys.worker1(), AREA, TASK_TYPES, deadline, noNullifier);

        // Also ahead of the relayer check.
        vm.prank(Keys.worker1());
        vm.expectRevert(IWorkerRegistry.ZeroNullifier.selector);
        registry.registerFor(0, Keys.worker1(), AREA, TASK_TYPES, deadline, noNullifier);

        _assertUnbound(Keys.worker1(), 0);

        // Why 0 is not a usable nullifier: an address that never registered already reads back
        // as nullifier 0, and Reputation is keyed by that value.
        assertEq(registry.nullifierOf(Keys.worker3()), 0, "a stranger already reads as nullifier 0");

        vm.prank(Keys.deployer());
        vm.expectRevert(IWorkerRegistry.ZeroNullifier.selector);
        registry.seedWorker(Keys.worker2(), 0, SEED_AREA, SEED_TASK_TYPES);
    }

    function test_Seed_EmitsWorkerSeededNotRegistered() public {
        vm.recordLogs();
        vm.prank(Keys.deployer());
        registry.seedWorker(Keys.worker2(), SEED_NULLIFIER, SEED_AREA, SEED_TASK_TYPES);

        Vm.Log[] memory entries = vm.getRecordedLogs();
        uint256 seededLogs;
        uint256 registeredLogs;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics.length == 0) continue;
            if (entries[i].topics[0] == IWorkerRegistry.WorkerSeeded.selector) seededLogs++;
            if (entries[i].topics[0] == IWorkerRegistry.WorkerRegistered.selector) registeredLogs++;
        }
        assertEq(seededLogs, 1, "seedWorker must emit exactly one WorkerSeeded");
        assertEq(registeredLogs, 0, "a seeded worker must never look registered");

        assertTrue(registry.isWorker(Keys.worker2()), "seeded workers are workers");
        assertTrue(registry.isSeeded(Keys.worker2()), "and are flagged seeded");
        assertEq(registry.nullifierOf(Keys.worker2()), SEED_NULLIFIER);
        assertEq(registry.workerOf(SEED_NULLIFIER), Keys.worker2());
        assertEq(registry.areaOf(Keys.worker2()), SEED_AREA);
        assertEq(registry.taskTypesOf(Keys.worker2()), SEED_TASK_TYPES);

        vm.prank(Keys.relayer());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, Keys.relayer()));
        registry.seedWorker(Keys.worker3(), 0xFEED, SEED_AREA, SEED_TASK_TYPES);
    }

    function test_Reset_AllowsFreshAttestationOnly() public {
        _registerDefault();

        vm.prank(Keys.worker1());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, Keys.worker1()));
        registry.resetWorker(NULLIFIER);

        vm.expectEmit(true, true, false, true, address(registry));
        emit IWorkerRegistry.WorkerReset(NULLIFIER, Keys.worker1());
        vm.prank(Keys.deployer());
        registry.resetWorker(NULLIFIER);

        _assertUnbound(Keys.worker1(), NULLIFIER);

        // The identity is free again; the attestation that spent it is not.
        vm.prank(Keys.relayer());
        vm.expectRevert(IWorkerRegistry.AttestationUsed.selector);
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline, defaultAttestation);

        bytes memory attestationB = _goodAttest(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline + 1);
        vm.prank(Keys.relayer());
        registry.registerFor(NULLIFIER, Keys.worker1(), AREA, TASK_TYPES, deadline + 1, attestationB);
        assertTrue(registry.isWorker(Keys.worker1()), "a fresh attestation re-registers the rehearsal");

        vm.prank(Keys.deployer());
        vm.expectRevert(IWorkerRegistry.UnknownNullifier.selector);
        registry.resetWorker(0xBAD);

        // A reset clears the seeded flag as well, so a reset row is not a half-seeded one.
        vm.prank(Keys.deployer());
        registry.seedWorker(Keys.worker2(), SEED_NULLIFIER, SEED_AREA, SEED_TASK_TYPES);
        assertTrue(registry.isSeeded(Keys.worker2()));
        vm.prank(Keys.deployer());
        registry.resetWorker(SEED_NULLIFIER);
        _assertUnbound(Keys.worker2(), SEED_NULLIFIER);
    }

    function test_Views_O1Reads() public {
        _registerDefault();
        vm.prank(Keys.deployer());
        registry.seedWorker(Keys.worker2(), SEED_NULLIFIER, SEED_AREA, SEED_TASK_TYPES);

        uint256 gas = gasleft();
        bool workerFlag = registry.isWorker(Keys.worker1());
        _assertO1(gas, "isWorker");
        assertTrue(workerFlag);

        gas = gasleft();
        bool seededFlag = registry.isSeeded(Keys.worker1());
        _assertO1(gas, "isSeeded");
        assertFalse(seededFlag);

        gas = gasleft();
        uint256 nullifier = registry.nullifierOf(Keys.worker1());
        _assertO1(gas, "nullifierOf");
        assertEq(nullifier, NULLIFIER);

        gas = gasleft();
        address bound = registry.workerOf(NULLIFIER);
        _assertO1(gas, "workerOf");
        assertEq(bound, Keys.worker1());

        gas = gasleft();
        string memory area = registry.areaOf(Keys.worker1());
        _assertO1(gas, "areaOf");
        assertEq(area, AREA);

        gas = gasleft();
        uint8 taskTypes = registry.taskTypesOf(Keys.worker1());
        _assertO1(gas, "taskTypesOf");
        assertEq(taskTypes, TASK_TYPES);

        assertTrue(registry.isSeeded(Keys.worker2()), "the seeded row keeps its own flag");
        assertEq(registry.areaOf(Keys.worker2()), SEED_AREA);
        assertEq(registry.taskTypesOf(Keys.worker2()), SEED_TASK_TYPES);

        _assertUnbound(Keys.worker3(), 0xDEADBEEF);
    }

    /// @dev O(1) means a fixed handful of slots: no array walk can hide under this ceiling.
    function _assertO1(uint256 gasBefore, string memory label) internal view {
        uint256 spent = gasBefore - gasleft();
        assertLt(spent, MAX_VIEW_GAS, string.concat(label, " must be an O(1) read"));
    }
}
