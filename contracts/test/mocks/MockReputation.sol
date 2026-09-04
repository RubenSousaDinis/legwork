// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputation} from "../../src/interfaces/IReputation.sol";

/// @notice Records feedback calls so escrow tests can assert what the escrow wrote.
contract MockReputation is IReputation {
    struct Call {
        uint256 nullifierHash;
        bytes32 raterKey;
        uint8 outcome;
        uint256 taskId;
    }

    Call[] public calls;
    address public escrow;

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function lastCall() external view returns (Call memory) {
        return calls[calls.length - 1];
    }

    function feedback(uint256 nullifierHash, bytes32 raterKey, uint8 outcome_, uint256 taskId) external {
        calls.push(Call(nullifierHash, raterKey, outcome_, taskId));
        emit Feedback(nullifierHash, raterKey, outcome_, taskId, true);
    }

    function setEscrow(address escrow_) external {
        escrow = escrow_;
    }

    function score(uint256) external pure returns (int256) {
        return 0;
    }

    function completed(uint256) external pure returns (uint256) {
        return 0;
    }

    function distinctRaters(uint256) external pure returns (uint256) {
        return 0;
    }

    function slotOf(uint256, bytes32) external pure returns (uint8) {
        return 0;
    }
}
