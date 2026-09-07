// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC8004Identity, IERC8004Reputation} from "../../src/interfaces/IERC8004.sol";

/// @notice Stand-in IdentityRegistry: incrementing ids, settable owner and wallet. Mints the way the
///         live registry does (`_safeMint`, RESULTS `## S5`): a contract caller must answer
///         `onERC721Received` with the selector or the registration reverts `ERC721InvalidReceiver`.
contract MockIdentityRegistry is IERC8004Identity, IERC721Errors {
    uint256 public nextId = 1;
    mapping(uint256 => address) private _ownerOf;
    mapping(uint256 => address) private _walletOf;
    mapping(uint256 => string) public uriOf;

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = nextId++;
        uriOf[agentId] = agentURI;
        _ownerOf[agentId] = msg.sender;
        _walletOf[agentId] = msg.sender;
        _checkOnERC721Received(msg.sender, agentId);
    }

    /// @dev What OpenZeppelin's `_safeMint` does after minting to a contract.
    function _checkOnERC721Received(address to, uint256 tokenId) private {
        if (to.code.length == 0) return;
        try IERC721Receiver(to).onERC721Received(msg.sender, address(0), tokenId, "") returns (
            bytes4 retval
        ) {
            if (retval != IERC721Receiver.onERC721Received.selector) {
                revert ERC721InvalidReceiver(to);
            }
        } catch {
            revert ERC721InvalidReceiver(to);
        }
    }

    function setOwner(uint256 agentId, address owner_) external {
        _ownerOf[agentId] = owner_;
    }

    function setAgentWallet(uint256 agentId, address wallet) external {
        _walletOf[agentId] = wallet;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return _ownerOf[agentId];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _walletOf[agentId];
    }
}

/// @notice Stand-in ReputationRegistry: records giveFeedback, summarises from the record.
contract MockReputationRegistry is IERC8004Reputation {
    struct FeedbackCall {
        uint256 agentId;
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        address client;
    }

    FeedbackCall[] public calls;

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function lastCall() external view returns (FeedbackCall memory) {
        return calls[calls.length - 1];
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        calls.push(
            FeedbackCall(
                agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash, msg.sender
            )
        );
    }

    function getSummary(uint256 agentId, address[] calldata clients, string calldata tag1, string calldata)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        bytes32 t1 = keccak256(bytes(tag1));
        bool anyTag = t1 == keccak256(bytes(""));
        for (uint256 i = 0; i < calls.length; i++) {
            FeedbackCall storage c = calls[i];
            if (c.agentId != agentId) continue;
            if (!anyTag && keccak256(bytes(c.tag1)) != t1) continue;
            if (clients.length > 0) {
                bool hit = false;
                for (uint256 j = 0; j < clients.length; j++) {
                    if (clients[j] == c.client) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) continue;
            }
            count += 1;
            summaryValue += c.value;
            summaryValueDecimals = c.valueDecimals;
        }
    }
}
