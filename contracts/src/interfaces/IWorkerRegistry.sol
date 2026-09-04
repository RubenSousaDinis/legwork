// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Binds a World ID nullifier to one payout address. Frozen in T-01a.
/// @dev Task-type bitmask: verify-open = 1, photo-of = 2, call-confirm = 4, compare-two = 8.
///      `area` is a geohash-5 string (Leiria is "ez5ku").
interface IWorkerRegistry {
    error NotRelayer();
    error DuplicateNullifier();
    error WorkerAlreadyBound();
    error AttestationExpired();
    error BadAttestation();
    error AttestationUsed();
    error UnknownNullifier();
    /// @dev address(0) is the "not bound" sentinel in `workerOf`, so binding a nullifier to it
    ///      would read back as unbound and let the same human register a second account.
    error ZeroWorker();
    /// @dev 0 is the "no nullifier" sentinel in `nullifierOf`; a worker holding it is
    ///      indistinguishable from an unregistered address, and Reputation is keyed by it.
    error ZeroNullifier();

    event WorkerRegistered(
        uint256 indexed nullifierHash, address indexed worker, string area, uint8 taskTypes
    );
    /// @dev Seeded workers emit this and never WorkerRegistered, so the subgraph can tell
    ///      a demo row from a real human without a second source.
    event WorkerSeeded(
        uint256 indexed syntheticNullifier, address indexed worker, string area, uint8 taskTypes
    );
    event WorkerReset(uint256 indexed nullifierHash, address indexed worker);

    /// @notice Relayed registration. The attestation is EIP-712 signed by the verifier key
    ///         after the API has checked the proof against World's v4 verify endpoint.
    function registerFor(
        uint256 nullifierHash,
        address worker,
        string calldata area,
        uint8 taskTypes,
        uint256 deadline,
        bytes calldata attestation
    ) external;

    function seedWorker(address worker, uint256 syntheticNullifier, string calldata area, uint8 taskTypes)
        external;

    /// @notice Disclosed operator power: clears both directions so a rehearsal can re-register.
    function resetWorker(uint256 nullifierHash) external;

    function setRelayer(address relayer_) external;
    function setAttestationVerifier(address verifier) external;

    function isWorker(address worker) external view returns (bool);
    function isSeeded(address worker) external view returns (bool);
    function nullifierOf(address worker) external view returns (uint256);
    function workerOf(uint256 nullifierHash) external view returns (address);
    function areaOf(address worker) external view returns (string memory);
    function taskTypesOf(address worker) external view returns (uint8);
    function relayer() external view returns (address);
    function attestationVerifier() external view returns (address);
}
