// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Outcome codes shared by Reputation (worker side) and AbuseMark (agent side).
/// @dev Interfaces cannot hold constants, so they live here. Frozen in T-01a: the API,
///      the subgraph and the tests all decode these same three numbers.
library Outcomes {
    /// @notice Released on proof. Worker +1; agent +1 tagged `paid-on-proof`.
    uint8 internal constant PAID = 1;
    /// @notice Dispute rejected by the operator. Worker +1; agent -1 tagged `disputed`.
    uint8 internal constant RESOLVED_TO_WORKER = 2;
    /// @notice Dispute upheld. Worker -1; agent +1 tagged `disputed`.
    uint8 internal constant RESOLVED_TO_BUYER = 3;
}
