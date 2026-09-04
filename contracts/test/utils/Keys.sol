// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice Deterministic role keys shared by every contract test, so a signature fixture
///         produced in one test file verifies in another (T-11 and T-20 share the
///         attestation vector this way).
library Keys {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant DEPLOYER_PK = 0xA11CE01;
    uint256 internal constant RELAYER_PK = 0xA11CE02;
    uint256 internal constant VERIFIER_PK = 0xA11CE03;
    uint256 internal constant SIGNER_PK = 0xA11CE04;
    uint256 internal constant BUYER_PK = 0xA11CE05;
    uint256 internal constant WORKER1_PK = 0xA11CE06;
    uint256 internal constant WORKER2_PK = 0xA11CE07;
    uint256 internal constant WORKER3_PK = 0xA11CE08;
    uint256 internal constant TREASURY_PK = 0xA11CE09;

    function deployer() internal pure returns (address) {
        return vm.addr(DEPLOYER_PK);
    }

    function relayer() internal pure returns (address) {
        return vm.addr(RELAYER_PK);
    }

    function verifier() internal pure returns (address) {
        return vm.addr(VERIFIER_PK);
    }

    function signer() internal pure returns (address) {
        return vm.addr(SIGNER_PK);
    }

    function buyer() internal pure returns (address) {
        return vm.addr(BUYER_PK);
    }

    function worker1() internal pure returns (address) {
        return vm.addr(WORKER1_PK);
    }

    function worker2() internal pure returns (address) {
        return vm.addr(WORKER2_PK);
    }

    function worker3() internal pure returns (address) {
        return vm.addr(WORKER3_PK);
    }

    function treasury() internal pure returns (address) {
        return vm.addr(TREASURY_PK);
    }
}
