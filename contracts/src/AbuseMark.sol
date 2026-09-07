// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {IAbuseMark} from "./interfaces/IAbuseMark.sol";
import {IERC8004Identity, IERC8004Reputation} from "./interfaces/IERC8004.sol";
import {Outcomes} from "./interfaces/Outcomes.sol";

/// @title AbuseMark — the agent-side writer
/// @notice Holds the Task API's own ERC-8004 identity and is the only contract that writes
///         agent-side feedback to the deployed ERC-8004 ReputationRegistry. There is no mirror of
///         that record here: `mark` and `outcome` write straight through.
/// @dev    Operator-attested in v0 — disclosed. The refusal that produces a `mark` is decided by
///         the operator's Task API off-chain; this contract records that judgement, it does not
///         make it.
///
///         The agentId is never read from a request body; the Task API resolves it from the payer
///         via IdentityRegistry at screening time. No registered identity means a dashboard log
///         entry and no mark; a schema error is an ordinary 4xx and no mark.
///
///         Operator powers in v0 — disclosed:
///         - `setMarkCooldown(uint256)` — owner-only. Default 86400 s; the filmed run sets 120 s so
///           a rehearsal mark does not burn the window and make the 0 -> 1 beat unfilmable, and
///           says so on screen, like `disputeWindow`.
///         - `setSigner(address)` — owner-only. The AbuseMark signer key is separate from the
///           relayer and from the attestation verifier, so one leaked key cannot mark an agent.
///         - `setEscrow(address)` — owner-only. Wired by T-14 once `TaskEscrow` exists.
///         - `registerIdentity(string)` — owner-only, once. Registers the Task API's own ERC-8004
///           identity and stores the id it is given.
///
///         Abuse class ids and labels are verbatim from Mehta (arXiv:2602.19514) and live in
///         `classLabel` only, so the strings written on chain and the strings the dashboard renders
///         cannot drift apart.
contract AbuseMark is IAbuseMark, IERC721Receiver, Ownable {
    /// @notice The ERC-8004 IdentityRegistry this contract registers its own identity with.
    IERC8004Identity public immutable identityRegistry;

    /// @notice The ERC-8004 ReputationRegistry every mark and outcome is written to.
    IERC8004Reputation public immutable reputationRegistry;

    /// @inheritdoc IAbuseMark
    address public signer;

    /// @inheritdoc IAbuseMark
    /// @dev Starts at address(0): `outcome` reverts until the owner wires the escrow.
    address public escrow;

    /// @inheritdoc IAbuseMark
    uint256 public markCooldown = 86400;

    /// @inheritdoc IAbuseMark
    uint256 public selfAgentId;

    /// @inheritdoc IAbuseMark
    mapping(uint256 => mapping(bytes32 => bool)) public marked;

    /// @inheritdoc IAbuseMark
    mapping(uint256 => uint256) public lastMarkAt;

    /// @inheritdoc IAbuseMark
    mapping(uint256 => uint256) public marksOf;

    constructor(address initialOwner, address signer_, address identityRegistry_, address reputationRegistry_)
        Ownable(initialOwner)
    {
        signer = signer_;
        identityRegistry = IERC8004Identity(identityRegistry_);
        reputationRegistry = IERC8004Reputation(reputationRegistry_);
    }

    /// @notice The abuse-class label written as `tag2`, verbatim from the paper.
    /// @dev The only copy of these six strings in the codebase.
    function classLabel(uint8 classId) public pure returns (string memory) {
        if (classId == 1) return "credential fraud";
        if (classId == 2) return "identity impersonation";
        if (classId == 3) return "automated reconnaissance";
        if (classId == 4) return "social media manipulation";
        if (classId == 5) return "authentication circumvention";
        if (classId == 6) return "referral fraud";
        revert BadClass();
    }

    /// @inheritdoc IAbuseMark
    function mark(uint256 agentId, uint8 classId, bytes32 specHash) external returns (bool written) {
        if (msg.sender != signer) revert NotSigner();
        if (classId == 0 || classId > 6) revert BadClass();
        // Idempotent per (agentId, specHash), and idempotency comes first: an agent retrying one
        // refused spec is answered with false, never with a cooldown revert.
        if (marked[agentId][specHash]) return false;
        // The `!= 0` guard keeps a first mark valid on a chain whose timestamp is below the
        // cooldown; without it no agent could ever be marked there.
        if (lastMarkAt[agentId] != 0 && block.timestamp < lastMarkAt[agentId] + markCooldown) {
            revert MarkCooldown();
        }

        marked[agentId][specHash] = true;
        lastMarkAt[agentId] = block.timestamp;
        marksOf[agentId] += 1;
        emit Marked(agentId, classId, specHash);

        reputationRegistry.giveFeedback(agentId, -1, 0, "task-refused", classLabel(classId), "", "", specHash);
        return true;
    }

    /// @inheritdoc IAbuseMark
    function outcome(uint256 agentId, uint256 taskId, uint8 outcome_) external {
        if (msg.sender != escrow) revert NotEscrow();

        int128 value;
        string memory tag1;
        if (outcome_ == Outcomes.PAID) {
            (value, tag1) = (int128(1), "paid-on-proof");
        } else if (outcome_ == Outcomes.RESOLVED_TO_WORKER) {
            // The agent's dispute was rejected.
            (value, tag1) = (int128(-1), "disputed");
        } else if (outcome_ == Outcomes.RESOLVED_TO_BUYER) {
            // The agent's dispute was upheld.
            (value, tag1) = (int128(1), "disputed");
        } else {
            revert BadOutcome();
        }

        emit Outcome(agentId, taskId, outcome_);

        reputationRegistry.giveFeedback(agentId, value, 0, tag1, "", "", "", bytes32(taskId));
    }

    /// @inheritdoc IAbuseMark
    function registerIdentity(string calldata agentURI) external onlyOwner returns (uint256 agentId) {
        if (selfAgentId != 0) revert IdentityAlreadyRegistered();
        // The one place the external call precedes the storage write: the id being stored is the
        // registry's own return value, and no funds move.
        agentId = identityRegistry.register(agentURI);
        selfAgentId = agentId;
    }

    /// @notice The ERC-8004 IdentityRegistry mints with `_safeMint` (RESULTS `## S5`), so the
    ///         contract that is to hold the Task API's identity must say it can receive an ERC-721,
    ///         or `registerIdentity` reverts `ERC721InvalidReceiver(address(this))` before any
    ///         state is written. Accepting unconditionally is the `ERC721Holder` behaviour: the
    ///         identity never leaves this contract, and nothing here depends on which token arrived.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @inheritdoc IAbuseMark
    function setMarkCooldown(uint256 seconds_) external onlyOwner {
        markCooldown = seconds_;
    }

    /// @inheritdoc IAbuseMark
    function setSigner(address signer_) external onlyOwner {
        signer = signer_;
    }

    /// @inheritdoc IAbuseMark
    function setEscrow(address escrow_) external onlyOwner {
        escrow = escrow_;
    }
}
