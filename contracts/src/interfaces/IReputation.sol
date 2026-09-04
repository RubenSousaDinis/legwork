// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Worker-side reputation, keyed by World ID nullifier. Frozen in T-01a.
/// @dev Keyed by nullifier, not address, so rotating a payout address never resets a
///      worker's history — and never lets someone shed a bad one either.
interface IReputation {
    error NotEscrow();
    error BadOutcome();

    /// @param newRater false when a rater overwrites its own earlier slot, which changes the
    ///        score but adds no voice — that is what stops one buyer manufacturing reputation.
    event Feedback(
        uint256 indexed nullifierHash, bytes32 indexed raterKey, uint8 outcome, uint256 taskId, bool newRater
    );

    function feedback(uint256 nullifierHash, bytes32 raterKey, uint8 outcome, uint256 taskId) external;
    function setEscrow(address escrow_) external;

    function score(uint256 nullifierHash) external view returns (int256);
    function completed(uint256 nullifierHash) external view returns (uint256);
    function distinctRaters(uint256 nullifierHash) external view returns (uint256);
    function slotOf(uint256 nullifierHash, bytes32 raterKey) external view returns (uint8);
    function escrow() external view returns (address);
}
