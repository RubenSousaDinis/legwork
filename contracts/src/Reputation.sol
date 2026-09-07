// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IReputation} from "./interfaces/IReputation.sol";
import {Outcomes} from "./interfaces/Outcomes.sol";

/// @title Reputation — worker side only; keyed by nullifier; one rater, one voice; the task is
///        the review
/// @notice Worker side only. There is no agent-side accumulator here: agent feedback is written
///         straight to the deployed ERC-8004 ReputationRegistry by `AbuseMark`.
/// @dev    Keyed by the World ID `nullifierHash`, not by an address, so rotating a payout address
///         never resets a worker's history — and never lets someone shed a bad one either.
///
///         One rater, one voice: `slot[nullifier][raterKey]` holds that rater's latest outcome. A
///         first write from a rater adds a voice (`distinctRaters++`); a repeat write from the same
///         rater overwrites its slot, moves `score` by the difference, and adds no voice. `completed`
///         counts tasks rather than voices, so "completed 1 -> 2 while distinct raters stays 1" is
///         representable.
///
///         `feedback` is called by `TaskEscrow` on release and on both resolves only — the task is
///         the review, so there is no free-standing rating endpoint to farm.
///
///         Operator powers in v0 — disclosed: `setEscrow(address)` is owner-only and is how T-14
///         wires the escrow once it exists.
///
///         O(1) throughout: no arrays, no loops and no external calls, so the escrow can afford to
///         call it inside a release.
contract Reputation is IReputation, Ownable {
    /// @inheritdoc IReputation
    mapping(uint256 => int256) public score;

    /// @inheritdoc IReputation
    mapping(uint256 => uint256) public completed;

    /// @inheritdoc IReputation
    mapping(uint256 => uint256) public distinctRaters;

    /// @inheritdoc IReputation
    mapping(uint256 => mapping(bytes32 => uint8)) public slotOf;

    /// @inheritdoc IReputation
    /// @dev Starts at address(0): nothing can write until the owner wires the escrow.
    address public escrow;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @inheritdoc IReputation
    function feedback(uint256 nullifierHash, bytes32 raterKey, uint8 outcome, uint256 taskId) external {
        if (msg.sender != escrow) revert NotEscrow();
        if (outcome == 0 || outcome > Outcomes.RESOLVED_TO_BUYER) revert BadOutcome();

        uint8 old = slotOf[nullifierHash][raterKey];
        bool newRater = old == 0;
        if (newRater) distinctRaters[nullifierHash] += 1;

        int256 delta = _value(outcome);
        if (!newRater) delta -= _value(old);
        score[nullifierHash] += delta;

        slotOf[nullifierHash][raterKey] = outcome;
        if (outcome != Outcomes.RESOLVED_TO_BUYER) completed[nullifierHash] += 1;

        emit Feedback(nullifierHash, raterKey, outcome, taskId, newRater);
    }

    /// @inheritdoc IReputation
    function setEscrow(address escrow_) external onlyOwner {
        escrow = escrow_;
    }

    /// @dev The value a slot contributes to `score`: +1 paid on proof, +1 resolved to the worker,
    ///      -1 resolved to the buyer.
    function _value(uint8 outcome) private pure returns (int256) {
        return outcome == Outcomes.RESOLVED_TO_BUYER ? int256(-1) : int256(1);
    }
}
