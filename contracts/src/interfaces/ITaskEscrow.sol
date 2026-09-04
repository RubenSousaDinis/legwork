// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice USDC escrow for one real-world task. Frozen in T-01a.
/// @dev Money: the fee is charged ON TOP. The agent pays amount + fee; the worker
///      receives `amount`; the treasury receives `fee`. 3.00 released, 0.45 fee, 3.45 paid.
///      All amounts are 6-decimal USDC integers (3.00 USDC == 3_000_000).
interface ITaskEscrow {
    enum TaskState {
        None,
        Open,
        Claimed,
        Submitted,
        Released,
        Refunded,
        Disputed,
        Resolved
    }

    /// @dev `area` is a geohash-5 so the subgraph never needs a coordinate.
    ///      `buyerAgentId` is the ERC-8004 id, verified against the registry by the API
    ///      before it ever reaches here; 0 means "no identity, log only".
    struct PostParams {
        uint8 taskType;
        bytes32 specHash;
        uint96 amount;
        address buyer;
        uint256 buyerAgentId;
        string area;
        uint32 claimTTL;
        uint32 submitTTL;
        uint32 disputeWindow;
    }

    struct Task {
        uint8 taskType;
        bytes32 specHash;
        uint96 amount;
        uint96 fee;
        address buyer;
        uint256 buyerAgentId;
        string area;
        address worker;
        TaskState state;
        uint64 postedAt;
        uint64 claimedAt;
        uint64 submittedAt;
        uint32 claimTTL;
        uint32 submitTTL;
        uint32 disputeWindow;
        bytes32 proofHash;
    }

    error NotRelayer();
    error NotBuyer();
    error NotBuyerOrRelayer();
    error NotWorker();
    error HasActiveClaim();
    error AlreadyClaimed();
    error NotClaimant();
    error InCooldown();
    error SeededCannotClaimExternal();
    error OverOpenCap();
    error BadState();
    error BadTaskType();
    error AmountOutOfRange();
    error SubmitWindowClosed();
    error DisputeWindowClosed();
    error DisputeWindowOpen();
    error NotExpired();

    event TaskPosted(
        uint256 indexed taskId,
        address indexed buyer,
        uint256 buyerAgentId,
        uint8 taskType,
        bytes32 specHash,
        uint96 amount,
        uint96 fee,
        string area,
        uint32 claimTTL,
        uint32 submitTTL,
        uint32 disputeWindow
    );
    event TaskClaimed(uint256 indexed taskId, address indexed worker);
    event ClaimReleased(uint256 indexed taskId, address indexed worker);
    /// @dev Lazy expiry: emitted by the claim that displaces a stale claimant. No keeper.
    event ClaimExpired(uint256 indexed taskId, address indexed staleWorker);
    event TaskSubmitted(uint256 indexed taskId, address indexed worker, bytes32 proofHash);
    event TaskReleased(uint256 indexed taskId, address indexed worker, uint96 amount, uint96 fee);
    event TaskDisputed(uint256 indexed taskId);
    event TaskResolved(uint256 indexed taskId, bool toBuyer);
    event TaskRefunded(uint256 indexed taskId, address indexed buyer, uint96 total);
    event BuyerAllowlisted(address indexed buyer, bool allowed);

    function post(PostParams calldata p) external returns (uint256 taskId);
    /// @dev The S3-fail pivot and the self-custodial roadmap. Ships day one so neither needs a redeploy.
    function postAsBuyer(PostParams calldata p) external returns (uint256 taskId);

    function claimFor(uint256 taskId, address worker) external;
    function claim(uint256 taskId) external;
    function releaseClaimFor(uint256 taskId, address worker) external;
    function releaseClaim(uint256 taskId) external;
    function submitFor(uint256 taskId, address worker, bytes32 proofHash) external;
    function submit(uint256 taskId, bytes32 proofHash) external;

    function approve(uint256 taskId) external;
    function dispute(uint256 taskId) external;
    function autoRelease(uint256 taskId) external;
    function resolve(uint256 taskId, bool toBuyer) external;
    function expire(uint256 taskId) external;

    /// @dev Pause gates only post / postAsBuyer / claim*. Never submit, autoRelease or expire:
    ///      a stop must not be able to trap a worker's earned funds.
    function pause() external;
    function unpause() external;
    function setAllowlistedBuyer(address buyer, bool allowed) external;

    function FEE_BPS() external view returns (uint16);
    function MAX_TASK_AMOUNT() external view returns (uint96);
    function CLAIM_COOLDOWN() external view returns (uint32);
    function maxOpenTasksPerBuyer() external view returns (uint256);

    function getTask(uint256 taskId) external view returns (Task memory);
    function openTasksOf(address buyer) external view returns (uint256);
    function activeClaimOf(address worker) external view returns (uint256);
    function cooldownUntil(address worker) external view returns (uint256);
    function allowlistedBuyer(address buyer) external view returns (bool);
    function taskCount() external view returns (uint256);
    function usdc() external view returns (address);
    function treasury() external view returns (address);
    function relayer() external view returns (address);
    function registry() external view returns (address);
    function reputation() external view returns (address);
    function abuseMark() external view returns (address);
}
