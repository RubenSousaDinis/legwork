// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAbuseMark} from "../../src/interfaces/IAbuseMark.sol";

/// @notice Records mark/outcome calls so escrow and API tests can assert what was written.
contract MockAbuseMark is IAbuseMark {
    struct OutcomeCall {
        uint256 agentId;
        uint256 taskId;
        uint8 outcome;
    }

    OutcomeCall[] public outcomeCalls;
    mapping(uint256 => mapping(bytes32 => bool)) private _marked;
    uint256 public markCooldown = 86400;
    uint256 public selfAgentId;
    address public signer;
    address public escrow;

    function outcomeCallCount() external view returns (uint256) {
        return outcomeCalls.length;
    }

    function lastOutcome() external view returns (OutcomeCall memory) {
        return outcomeCalls[outcomeCalls.length - 1];
    }

    function mark(uint256 agentId, uint8 classId, bytes32 specHash) external returns (bool written) {
        if (_marked[agentId][specHash]) return false;
        _marked[agentId][specHash] = true;
        emit Marked(agentId, classId, specHash);
        return true;
    }

    function outcome(uint256 agentId, uint256 taskId, uint8 outcome_) external {
        outcomeCalls.push(OutcomeCall(agentId, taskId, outcome_));
        emit Outcome(agentId, taskId, outcome_);
    }

    function registerIdentity(string calldata) external returns (uint256) {
        selfAgentId = 1;
        return 1;
    }

    function setMarkCooldown(uint256 seconds_) external {
        markCooldown = seconds_;
    }

    function setSigner(address signer_) external {
        signer = signer_;
    }

    function setEscrow(address escrow_) external {
        escrow = escrow_;
    }

    function marked(uint256 agentId, bytes32 specHash) external view returns (bool) {
        return _marked[agentId][specHash];
    }

    function lastMarkAt(uint256) external pure returns (uint256) {
        return 0;
    }

    function marksOf(uint256) external pure returns (uint256) {
        return 0;
    }
}
