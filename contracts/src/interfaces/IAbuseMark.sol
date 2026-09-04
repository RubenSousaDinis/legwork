// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Holds the Task API's own ERC-8004 identity and is the only writer of agent-side
///         feedback. Frozen in T-01a.
/// @dev Abuse class ids, labels verbatim from Mehta (arXiv:2602.19514):
///      1 credential fraud · 2 identity impersonation · 3 automated reconnaissance
///      4 social media manipulation · 5 authentication circumvention · 6 referral fraud
interface IAbuseMark {
    error NotSigner();
    error NotEscrow();
    error BadClass();
    error BadOutcome();
    error MarkCooldown();
    error IdentityAlreadyRegistered();

    event Marked(uint256 indexed agentId, uint8 classId, bytes32 specHash);
    event Outcome(uint256 indexed agentId, uint256 indexed taskId, uint8 outcome);

    /// @notice Records a refusal against an agent's ERC-8004 identity.
    /// @dev Idempotent per (agentId, specHash): a repeat returns false, writes nothing and
    ///      emits nothing, so a retrying agent cannot be marked twice for one refusal.
    /// @return written false when the pair was already marked.
    function mark(uint256 agentId, uint8 classId, bytes32 specHash) external returns (bool written);

    /// @notice Task settlement feedback, written by the escrow on release and on both resolves.
    function outcome(uint256 agentId, uint256 taskId, uint8 outcome_) external;

    function registerIdentity(string calldata agentURI) external returns (uint256 agentId);

    /// @dev Default 86400. The filmed run sets 120 so a rehearsal mark does not burn the
    ///      day's only mark and make the 0 -> 1 beat unfilmable. Owner-settable and disclosed.
    function setMarkCooldown(uint256 seconds_) external;
    function setSigner(address signer_) external;
    function setEscrow(address escrow_) external;

    function marked(uint256 agentId, bytes32 specHash) external view returns (bool);
    function lastMarkAt(uint256 agentId) external view returns (uint256);
    function marksOf(uint256 agentId) external view returns (uint256);
    function markCooldown() external view returns (uint256);
    function selfAgentId() external view returns (uint256);
    function signer() external view returns (address);
    function escrow() external view returns (address);
}
