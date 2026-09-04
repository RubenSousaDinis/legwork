// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITaskEscrow} from "./interfaces/ITaskEscrow.sol";
import {IWorkerRegistry} from "./interfaces/IWorkerRegistry.sol";
import {IReputation} from "./interfaces/IReputation.sol";
import {IAbuseMark} from "./interfaces/IAbuseMark.sol";
import {Outcomes} from "./interfaces/Outcomes.sol";

/// @title TaskEscrow — the money path for one real-world task
/// @notice Holds a task's USDC from `post` through `Released`, `Refunded` or `Resolved`.
///
/// Money, on every surface: the fee is charged ON TOP of the posted rate. The agent pays
/// 3.45, the escrow locks 3.45, the worker receives 3.00 and the treasury receives the
/// 0.45 fee. The worker keeps 100% of the rate that was posted. All figures are 6-decimal
/// USDC integers, so 3.00 USDC is 3_000_000.
///
/// Operator powers in v0, disclosed rather than hidden:
///  1. `resolve` — after a dispute, the owner key decides the outcome. Zero fee on either
///     branch: we do not earn on a task we arbitrate.
///  2. `pause` — pause gates post and claim only, so a stop can never trap a worker's
///     earned funds. `submit`, `approve`, `dispute`, `autoRelease`, `resolve`, `expire` and
///     `releaseClaim` keep working while paused. The asymmetry is the design choice.
///  3. `setAllowlistedBuyer` — marks a buyer whose tasks a seeded worker may claim, so
///     seeded completions only ever feed the operator's own demo data.
contract TaskEscrow is ITaskEscrow, Ownable, Pausable {
    using SafeERC20 for IERC20;

    /// @notice 15% on top of the posted rate: 3.00 posted, 0.45 fee, 3.45 locked.
    uint16 public constant FEE_BPS = 1500;
    /// @notice Per-task cap, 10 USDC. The blast radius of one injected agent is onchain.
    uint96 public constant MAX_TASK_AMOUNT = 10_000_000;
    /// @notice Floor of 1 USDC, so dust tasks cannot pad a worker's completion count.
    uint96 public constant MIN_TASK_AMOUNT = 1_000_000;
    /// @notice 15 minutes out after a claim goes stale, so claim-and-vanish cannot loop.
    uint32 public constant CLAIM_COOLDOWN = 900;
    /// @notice Floor for every per-task window. A minute is the shortest one a human can act in.
    uint32 public constant MIN_WINDOW = 60;
    /// @notice Ceiling for every per-task window: seven days.
    uint32 public constant MAX_WINDOW = 604_800;

    /// @notice No setter in v0: the bound is onchain, not policy.
    uint256 public maxOpenTasksPerBuyer = 5;

    address public immutable usdc;
    address public immutable registry;
    address public immutable treasury;
    address public immutable relayer;
    address public immutable reputation;
    address public immutable abuseMark;

    mapping(uint256 => Task) private _tasks;

    uint256 public taskCount;
    /// @notice Tasks in Open, Claimed, Submitted or Disputed. Decremented exactly once,
    ///         when the task reaches Released, Refunded or Resolved.
    mapping(address => uint256) public openTasksOf;
    mapping(address => uint256) public activeClaimOf;
    mapping(address => uint256) public cooldownUntil;
    mapping(address => bool) public allowlistedBuyer;

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(
        address initialOwner,
        address usdc_,
        address treasury_,
        address relayer_,
        address registry_,
        address reputation_,
        address abuseMark_
    ) Ownable(initialOwner) {
        usdc = usdc_;
        treasury = treasury_;
        relayer = relayer_;
        registry = registry_;
        reputation = reputation_;
        abuseMark = abuseMark_;
    }

    // ---------------------------------------------------------------- posting

    /// @inheritdoc ITaskEscrow
    /// @dev Called by the operator from a pre-funded float after x402 /verify and screening
    ///      and before /settle. `p.buyer` is the x402 payer, bound into the signed
    ///      authorization, so it cannot be swapped here.
    function post(PostParams calldata p) external onlyRelayer whenNotPaused returns (uint256 taskId) {
        return _post(p, msg.sender);
    }

    /// @inheritdoc ITaskEscrow
    function postAsBuyer(PostParams calldata p) external whenNotPaused returns (uint256 taskId) {
        if (p.buyer != msg.sender) revert NotBuyer();
        return _post(p, msg.sender);
    }

    function _post(PostParams calldata p, address payer) internal returns (uint256 taskId) {
        if (p.taskType != 1 && p.taskType != 2 && p.taskType != 4 && p.taskType != 8) revert BadTaskType();
        if (p.amount < MIN_TASK_AMOUNT || p.amount > MAX_TASK_AMOUNT) revert AmountOutOfRange();
        if (p.buyer == address(0)) revert NotBuyer();
        if (
            _windowOutOfRange(p.claimTTL) || _windowOutOfRange(p.submitTTL)
                || _windowOutOfRange(p.disputeWindow)
        ) {
            revert AmountOutOfRange();
        }
        if (openTasksOf[p.buyer] >= maxOpenTasksPerBuyer) revert OverOpenCap();

        uint96 fee = uint96(uint256(p.amount) * FEE_BPS / 10_000);
        taskId = ++taskCount;

        Task storage t = _tasks[taskId];
        t.taskType = p.taskType;
        t.specHash = p.specHash;
        t.amount = p.amount;
        t.fee = fee;
        t.buyer = p.buyer;
        t.buyerAgentId = p.buyerAgentId;
        t.area = p.area;
        t.worker = address(0);
        t.state = TaskState.Open;
        t.postedAt = uint64(block.timestamp);
        t.claimTTL = p.claimTTL;
        t.submitTTL = p.submitTTL;
        t.disputeWindow = p.disputeWindow;

        openTasksOf[p.buyer]++;

        _emitPosted(taskId, p, fee);

        IERC20(usdc).safeTransferFrom(payer, address(this), uint256(p.amount) + fee);
    }

    /// @dev The eleven-field event gets its own frame: emitting it inline alongside the
    ///      post checks overflows the stack without via-ir, which foundry.toml does not use.
    function _emitPosted(uint256 taskId, PostParams calldata p, uint96 fee) internal {
        emit TaskPosted(
            taskId,
            p.buyer,
            p.buyerAgentId,
            p.taskType,
            p.specHash,
            p.amount,
            fee,
            p.area,
            p.claimTTL,
            p.submitTTL,
            p.disputeWindow
        );
    }

    /// @dev A window outside these bounds is a posting mistake with no way back. `expire`
    ///      refunds through `safeTransfer(buyer, …)` and USDC rejects the zero address, so a
    ///      zero buyer would strand the money for good; and a `disputeWindow` of
    ///      `type(uint32).max` holds the worker's one claim slot open forever once the task is
    ///      submitted, which an owner `resolve` is then the only way out of. `postAsBuyer` is
    ///      callable by anyone, so both are checked here rather than left to the API.
    function _windowOutOfRange(uint32 window) internal pure returns (bool) {
        return window < MIN_WINDOW || window > MAX_WINDOW;
    }

    // --------------------------------------------------------------- claiming

    /// @inheritdoc ITaskEscrow
    function claimFor(uint256 taskId, address worker) external onlyRelayer whenNotPaused {
        _claim(taskId, worker);
    }

    /// @inheritdoc ITaskEscrow
    /// @dev Retained for the CLI worker and a future self-custodial path.
    function claim(uint256 taskId) external whenNotPaused {
        _claim(taskId, msg.sender);
    }

    /// @dev Lazy expiry lives here: no keeper exists, so the claim that displaces a stale
    ///      claimant is what retires the stale one. An Open task past `postedAt + claimTTL`
    ///      stays claimable; `expire` is the only path that retires it.
    function _claim(uint256 taskId, address worker) internal {
        Task storage t = _tasks[taskId];

        if (!IWorkerRegistry(registry).isWorker(worker)) revert NotWorker();
        if (activeClaimOf[worker] != 0) revert HasActiveClaim();
        if (block.timestamp < cooldownUntil[worker]) revert InCooldown();
        if (IWorkerRegistry(registry).isSeeded(worker) && !allowlistedBuyer[t.buyer]) {
            revert SeededCannotClaimExternal();
        }

        if (t.state == TaskState.Claimed) {
            if (block.timestamp <= uint256(t.claimedAt) + t.claimTTL) revert AlreadyClaimed();
            address stale = t.worker;
            activeClaimOf[stale] = 0;
            cooldownUntil[stale] = block.timestamp + CLAIM_COOLDOWN;
            emit ClaimExpired(taskId, stale);
        } else if (t.state != TaskState.Open) {
            revert BadState();
        }

        t.worker = worker;
        t.state = TaskState.Claimed;
        t.claimedAt = uint64(block.timestamp);
        activeClaimOf[worker] = taskId;

        emit TaskClaimed(taskId, worker);
    }

    /// @inheritdoc ITaskEscrow
    function releaseClaimFor(uint256 taskId, address worker) external onlyRelayer {
        _releaseClaim(taskId, worker);
    }

    /// @inheritdoc ITaskEscrow
    function releaseClaim(uint256 taskId) external {
        _releaseClaim(taskId, msg.sender);
    }

    /// @dev Handing a task back is not a failure, so it carries no cooldown. The only
    ///      cooldown is the one lazy expiry sets.
    function _releaseClaim(uint256 taskId, address worker) internal {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Claimed) revert BadState();
        if (t.worker != worker) revert NotClaimant();

        t.state = TaskState.Open;
        t.worker = address(0);
        t.claimedAt = 0;
        activeClaimOf[worker] = 0;

        emit ClaimReleased(taskId, worker);
    }

    // ------------------------------------------------------------- submitting

    /// @inheritdoc ITaskEscrow
    function submitFor(uint256 taskId, address worker, bytes32 proofHash) external onlyRelayer {
        _submit(taskId, worker, proofHash);
    }

    /// @inheritdoc ITaskEscrow
    function submit(uint256 taskId, bytes32 proofHash) external {
        _submit(taskId, msg.sender, proofHash);
    }

    /// @dev `activeClaimOf[worker]` stays set through Submitted and Disputed; only a release
    ///      or a resolve clears it, so a worker cannot take a second task while a dispute
    ///      window on the first is still open.
    function _submit(uint256 taskId, address worker, bytes32 proofHash) internal {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Claimed) revert BadState();
        if (t.worker != worker) revert NotClaimant();
        if (block.timestamp > uint256(t.claimedAt) + t.submitTTL) revert SubmitWindowClosed();

        t.state = TaskState.Submitted;
        t.submittedAt = uint64(block.timestamp);
        t.proofHash = proofHash;

        emit TaskSubmitted(taskId, worker, proofHash);
    }

    // ---------------------------------------------------------------- settling

    /// @inheritdoc ITaskEscrow
    /// @dev The buyer accepts the proof, or the relayer does it on the buyer's behalf.
    function approve(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (msg.sender != t.buyer && msg.sender != relayer) revert NotBuyerOrRelayer();
        if (t.state != TaskState.Submitted) revert BadState();
        _release(taskId);
    }

    /// @inheritdoc ITaskEscrow
    /// @dev A dispute moves no money. It parks the task until the owner arbitrates.
    function dispute(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (msg.sender != t.buyer && msg.sender != relayer) revert NotBuyerOrRelayer();
        if (t.state != TaskState.Submitted) revert BadState();
        if (block.timestamp >= uint256(t.submittedAt) + t.disputeWindow) revert DisputeWindowClosed();

        t.state = TaskState.Disputed;

        emit TaskDisputed(taskId);
    }

    /// @inheritdoc ITaskEscrow
    /// @dev Anyone, once the window has run out: a buyer who stops watching cannot hold a
    ///      worker's proof hostage by doing nothing.
    function autoRelease(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Submitted) revert BadState();
        if (block.timestamp < uint256(t.submittedAt) + t.disputeWindow) revert DisputeWindowOpen();
        _release(taskId);
    }

    /// @inheritdoc ITaskEscrow
    /// @dev Zero fee on either branch — we do not earn on a task we arbitrate. To the worker:
    ///      the worker is paid the rate and the buyer gets the fee back. To the buyer: the
    ///      buyer gets both. The treasury is paid only in `_release`.
    function resolve(uint256 taskId, bool toBuyer) external onlyOwner {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Disputed) revert BadState();

        address worker = t.worker;
        address buyer = t.buyer;
        uint96 amount = t.amount;
        uint96 fee = t.fee;
        uint256 agentId = t.buyerAgentId;
        uint8 code = toBuyer ? Outcomes.RESOLVED_TO_BUYER : Outcomes.RESOLVED_TO_WORKER;

        t.state = TaskState.Resolved;
        activeClaimOf[worker] = 0;
        openTasksOf[buyer]--;

        emit TaskResolved(taskId, toBuyer);

        if (toBuyer) {
            IERC20(usdc).safeTransfer(buyer, uint256(amount) + fee);
        } else {
            IERC20(usdc).safeTransfer(worker, amount);
            IERC20(usdc).safeTransfer(buyer, fee);
        }
        _writeOutcome(taskId, worker, buyer, agentId, code);
    }

    /// @dev Checks-effects-interactions: state, counters and the event first, then the two
    ///      transfers, then the two feedback hooks.
    function _release(uint256 taskId) internal {
        Task storage t = _tasks[taskId];

        address worker = t.worker;
        address buyer = t.buyer;
        uint96 amount = t.amount;
        uint96 fee = t.fee;
        uint256 agentId = t.buyerAgentId;

        t.state = TaskState.Released;
        activeClaimOf[worker] = 0;
        openTasksOf[buyer]--;

        emit TaskReleased(taskId, worker, amount, fee);

        IERC20(usdc).safeTransfer(worker, amount);
        IERC20(usdc).safeTransfer(treasury, fee);
        _writeOutcome(taskId, worker, buyer, agentId, Outcomes.PAID);
    }

    /// @dev Worker-side feedback is keyed by the World ID nullifier, so a rotated payout
    ///      address neither resets a history nor sheds one. Agent-side feedback is skipped
    ///      when the buyer posted without an ERC-8004 identity: there is nothing to mark.
    function _writeOutcome(uint256 taskId, address worker, address buyer, uint256 agentId, uint8 code)
        internal
    {
        bytes32 raterKey = agentId != 0 ? bytes32(agentId) : bytes32(uint256(uint160(buyer)));
        IReputation(reputation)
            .feedback(IWorkerRegistry(registry).nullifierOf(worker), raterKey, code, taskId);
        if (agentId != 0) IAbuseMark(abuseMark).outcome(agentId, taskId, code);
    }

    /// @inheritdoc ITaskEscrow
    /// @dev Anyone may expire, and the refund always goes to `buyer` — never to the relayer
    ///      that fronted the float, so an agent that pays and gets nothing is made whole.
    function expire(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        TaskState state = t.state;
        if (state != TaskState.Open && state != TaskState.Claimed) revert BadState();

        bool openExpired = state == TaskState.Open && block.timestamp > uint256(t.postedAt) + t.claimTTL;
        bool claimExpired = state == TaskState.Claimed && block.timestamp > uint256(t.claimedAt) + t.submitTTL;
        if (!openExpired && !claimExpired) revert NotExpired();

        address buyer = t.buyer;
        uint96 total = t.amount + t.fee;

        t.state = TaskState.Refunded;
        if (t.worker != address(0)) activeClaimOf[t.worker] = 0;
        openTasksOf[buyer]--;

        emit TaskRefunded(taskId, buyer, total);

        IERC20(usdc).safeTransfer(buyer, total);
    }

    // ----------------------------------------------------------------- admin

    /// @inheritdoc ITaskEscrow
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc ITaskEscrow
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc ITaskEscrow
    function setAllowlistedBuyer(address buyer, bool allowed) external onlyOwner {
        allowlistedBuyer[buyer] = allowed;
        emit BuyerAllowlisted(buyer, allowed);
    }

    // ----------------------------------------------------------------- views

    /// @inheritdoc ITaskEscrow
    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }
}
