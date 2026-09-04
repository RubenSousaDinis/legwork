// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWorkerRegistry} from "../../src/interfaces/IWorkerRegistry.sol";

/// @notice Settable worker registry so escrow tests do not need real attestations.
contract MockRegistry is IWorkerRegistry {
    mapping(address => bool) private _isWorker;
    mapping(address => bool) private _isSeeded;
    mapping(address => uint256) private _nullifierOf;
    mapping(uint256 => address) private _workerOf;
    mapping(address => string) private _areaOf;
    mapping(address => uint8) private _taskTypesOf;
    address public relayer;
    address public attestationVerifier;

    function setWorker(address worker, uint256 nullifierHash, bool seeded) external {
        _isWorker[worker] = true;
        _isSeeded[worker] = seeded;
        _nullifierOf[worker] = nullifierHash;
        _workerOf[nullifierHash] = worker;
    }

    function setNotWorker(address worker) external {
        _isWorker[worker] = false;
    }

    function registerFor(uint256, address, string calldata, uint8, uint256, bytes calldata) external pure {
        revert("mock");
    }

    function seedWorker(address, uint256, string calldata, uint8) external pure {
        revert("mock");
    }

    function resetWorker(uint256) external pure {
        revert("mock");
    }

    function setRelayer(address relayer_) external {
        relayer = relayer_;
    }

    function setAttestationVerifier(address verifier) external {
        attestationVerifier = verifier;
    }

    function isWorker(address worker) external view returns (bool) {
        return _isWorker[worker];
    }

    function isSeeded(address worker) external view returns (bool) {
        return _isSeeded[worker];
    }

    function nullifierOf(address worker) external view returns (uint256) {
        return _nullifierOf[worker];
    }

    function workerOf(uint256 nullifierHash) external view returns (address) {
        return _workerOf[nullifierHash];
    }

    function areaOf(address worker) external view returns (string memory) {
        return _areaOf[worker];
    }

    function taskTypesOf(address worker) external view returns (uint8) {
        return _taskTypesOf[worker];
    }
}
