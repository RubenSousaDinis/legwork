// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IWorkerRegistry} from "./interfaces/IWorkerRegistry.sol";

/// @title WorkerRegistry — one human, one worker account
/// @notice Binds a World ID nullifier hash to exactly one payout address. The Task API checks the
///         proof in the cloud, signs an EIP-712 attestation with the attestation verifier key, and
///         the relayer submits it here. The attestation is single-use (`usedDigest`), chain-bound
///         and contract-bound (EIP-712 domain), deadline-bound, and covers the whole
///         `(nullifierHash, worker, area, taskTypes, deadline)` tuple, so it cannot be re-submitted
///         to bind the same human to a second address or replayed on another chain.
/// @dev    Honesty caption rendered beside every registration:
///         "cloud-verified, operator-attested — onchain World ID verification is Orb-only today."
///
///         Operator powers in v0 — disclosed:
///         - `seedWorker(worker, syntheticNullifier, area, taskTypes)` — owner-only. Writes a demo
///           row with `seeded = true` and emits `WorkerSeeded`, never `WorkerRegistered`, so the
///           subgraph and the dashboard can tell a demo row from a verified human from the event
///           alone. This path cannot produce a verified registration.
///         - `resetWorker(nullifierHash)` — owner-only. Deletes both directions of a binding so the
///           demo World ID can be rehearsed before it is filmed. It deliberately leaves
///           `usedDigest` set: a reset frees the identity, never an already-spent attestation.
///
///         O(1) throughout: no arrays and no loops, so `isWorker` / `isSeeded` / `nullifierOf` stay
///         cheap enough for the escrow to read them on every claim and release.
contract WorkerRegistry is IWorkerRegistry, Ownable, EIP712 {
    /// @notice EIP-712 type hash for the registration attestation. `area` is a dynamic string, so
    ///         it is hashed with `keccak256(bytes(area))` when the struct is encoded.
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)"
    );

    struct Record {
        uint256 nullifier;
        string area;
        uint8 taskTypes;
        bool seeded;
        bool bound;
    }

    mapping(address => Record) private records;

    /// @inheritdoc IWorkerRegistry
    mapping(uint256 => address) public workerOf;

    /// @notice Attestation digests already spent. Never cleared, not even by `resetWorker`.
    mapping(bytes32 => bool) public usedDigest;

    /// @inheritdoc IWorkerRegistry
    address public relayer;

    /// @inheritdoc IWorkerRegistry
    address public attestationVerifier;

    constructor(address initialOwner, address relayer_, address attestationVerifier_)
        Ownable(initialOwner)
        EIP712("Legwork WorkerRegistry", "1")
    {
        relayer = relayer_;
        attestationVerifier = attestationVerifier_;
    }

    /// @inheritdoc IWorkerRegistry
    /// @dev Check order is fixed so the same error always fires first: relayer, deadline, digest
    ///      already spent, signer, nullifier already bound, address already bound.
    function registerFor(
        uint256 nullifierHash,
        address worker,
        string calldata area,
        uint8 taskTypes,
        uint256 deadline,
        bytes calldata attestation
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (block.timestamp > deadline) revert AttestationExpired();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH, nullifierHash, worker, keccak256(bytes(area)), taskTypes, deadline
                )
            )
        );
        if (usedDigest[digest]) revert AttestationUsed();

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, attestation);
        if (err != ECDSA.RecoverError.NoError || recovered != attestationVerifier) revert BadAttestation();

        if (workerOf[nullifierHash] != address(0)) revert DuplicateNullifier();
        if (records[worker].bound) revert WorkerAlreadyBound();

        usedDigest[digest] = true;
        _bind(nullifierHash, worker, area, taskTypes, false);

        emit WorkerRegistered(nullifierHash, worker, area, taskTypes);
    }

    /// @inheritdoc IWorkerRegistry
    function seedWorker(address worker, uint256 syntheticNullifier, string calldata area, uint8 taskTypes)
        external
        onlyOwner
    {
        if (workerOf[syntheticNullifier] != address(0)) revert DuplicateNullifier();
        if (records[worker].bound) revert WorkerAlreadyBound();

        _bind(syntheticNullifier, worker, area, taskTypes, true);

        emit WorkerSeeded(syntheticNullifier, worker, area, taskTypes);
    }

    /// @inheritdoc IWorkerRegistry
    function resetWorker(uint256 nullifierHash) external onlyOwner {
        address worker = workerOf[nullifierHash];
        if (worker == address(0)) revert UnknownNullifier();

        delete records[worker];
        delete workerOf[nullifierHash];

        emit WorkerReset(nullifierHash, worker);
    }

    /// @inheritdoc IWorkerRegistry
    function setRelayer(address relayer_) external onlyOwner {
        relayer = relayer_;
    }

    /// @inheritdoc IWorkerRegistry
    function setAttestationVerifier(address verifier) external onlyOwner {
        attestationVerifier = verifier;
    }

    /// @inheritdoc IWorkerRegistry
    /// @dev True for seeded workers too — the escrow requires `isWorker` on every claim, and a
    ///      seeded worker may claim an operator-funded task. `isSeeded` is what separates them.
    function isWorker(address worker) external view returns (bool) {
        return records[worker].bound;
    }

    /// @inheritdoc IWorkerRegistry
    function isSeeded(address worker) external view returns (bool) {
        return records[worker].seeded;
    }

    /// @inheritdoc IWorkerRegistry
    function nullifierOf(address worker) external view returns (uint256) {
        return records[worker].nullifier;
    }

    /// @inheritdoc IWorkerRegistry
    function areaOf(address worker) external view returns (string memory) {
        return records[worker].area;
    }

    /// @inheritdoc IWorkerRegistry
    function taskTypesOf(address worker) external view returns (uint8) {
        return records[worker].taskTypes;
    }

    /// @dev Writes both directions of the binding. Callers check the two collision cases first.
    function _bind(uint256 nullifierHash, address worker, string calldata area, uint8 taskTypes, bool seeded)
        private
    {
        Record storage record = records[worker];
        record.nullifier = nullifierHash;
        record.area = area;
        record.taskTypes = taskTypes;
        record.seeded = seeded;
        record.bound = true;
        workerOf[nullifierHash] = worker;
    }
}
