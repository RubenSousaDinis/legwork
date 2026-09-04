// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal external views of the ERC-8004 reference registries on Base Sepolia.
/// @dev IdentityRegistry  0x8004A818BFB912233c491871b3d84c89A494BD9e
///      ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713
///      CONFIRM IN T-04 against the deployed ABIs. T-04 is the only task that may amend
///      this file, and only as an `interface-change` PR.
interface IERC8004Identity {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @dev There is no address -> agentId reverse lookup, which is why the API verifies a
///      claimed agent_id with ownerOf/getAgentWallet rather than looking one up from the payer.
interface IERC8004Reputation {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function getSummary(
        uint256 agentId,
        address[] calldata clients,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
}
