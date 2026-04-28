// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "openzeppelin-contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";

/// @title  BillingHub
/// @author SubSmart V2.0
/// @notice Non-custodial recurring-billing protocol. Funds always move
///         directly from the subscriber's wallet to the merchant; this
///         contract never custodies, escrows, or routes user funds.
/// @dev    Conforms to docs/2_SYSTEM_DESIGN.md and the rules in
///         docs/3_AI_CODING_GUIDELINES.md §5 (Smart Contract Coding):
///           - Solidity ^0.8.24, no upgradeability proxies.
///           - SafeERC20 for every token transfer.
///           - nonReentrant on every external function that calls
///             transferFrom.
///           - Strict CEI ordering (Checks → Effects → Interactions).
///           - Custom errors only — never require-strings.
///           - Every state-changing external function emits an indexed event
///             whose first three topics are the actors involved.
///
///         The auto-charge / Gelato relayer entrypoint is intentionally NOT
///         in this file — it lands in the next phase.
contract BillingHub is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice Treasury address (constructor arg) must be non-zero.
    error InvalidTreasury();
    /// @notice Token address must be non-zero.
    error InvalidToken();
    /// @notice Per-cycle charge amount must be greater than zero.
    error InvalidAmount();
    /// @notice Cycle length (seconds) must be greater than zero.
    error InvalidCycleLength();
    /// @notice Maximum cycles must be greater than zero.
    error InvalidMaxCycles();
    /// @notice Subscriber-chosen cycles must satisfy 0 < n <= plan.maxCycles.
    error InvalidCyclesAuthorized();
    /// @notice Plan does not exist.
    error PlanNotFound();
    /// @notice Plan exists but has been deactivated.
    error PlanInactive();
    /// @notice Subscriber already has an active subscription to this plan.
    error SubscriptionAlreadyActive();

    /// @notice Subscription is not active (never created, exhausted, or
    ///         terminated by the final cycle).
    error SubscriptionInactive();

    /// @notice The next charge time has not been reached yet.
    error ChargeNotDue();

    /// @notice The supplied subscription id has never been registered.
    error SubscriptionNotFound();

    /// @notice Caller is neither the subscriber nor the plan's merchant.
    error Unauthorized();

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Recurring billing plan published by a merchant.
    /// @param merchant            Recipient of every charge under this plan.
    /// @param token               ERC-20 token used for charges. MUST
    ///                            implement EIP-2612 Permit.
    /// @param amountPerCycle      Per-cycle charge amount, in token base units.
    /// @param cycleLengthSeconds  Length of one billing cycle, in seconds.
    /// @param maxCycles           Hard cap on cycles a single subscriber may
    ///                            authorize against this plan.
    /// @param active              Toggle. When false, new subscriptions are
    ///                            rejected (existing ones are unaffected).
    struct Plan {
        address merchant;
        address token;
        uint256 amountPerCycle;
        uint64 cycleLengthSeconds;
        uint32 maxCycles;
        bool active;
    }

    /// @notice Reverse lookup payload for a `bytes32` subscription id —
    ///         resolves the (planId, subscriber) pair without forcing every
    ///         caller to recompute the keccak preimage.
    /// @param  planId      Plan the subscription belongs to.
    /// @param  subscriber  Wallet that funded the subscription.
    struct SubscriptionLocator {
        uint256 planId;
        address subscriber;
    }

    /// @notice A subscriber's commitment to a plan.
    /// @param startTime         Unix timestamp at which the subscription began.
    /// @param nextChargeTime    Unix timestamp at which the next cycle is due.
    /// @param cyclesCharged     Number of cycles already settled (>= 1 after
    ///                          subscribe(), since the first cycle is charged
    ///                          atomically with subscription creation).
    /// @param cyclesAuthorized  Total cycles the subscriber permitted, capped
    ///                          by plan.maxCycles.
    /// @param active            Whether the subscription is live.
    struct Subscription {
        uint64 startTime;
        uint64 nextChargeTime;
        uint32 cyclesCharged;
        uint32 cyclesAuthorized;
        bool active;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Protocol fee charged on every recurring settlement, expressed
    ///         in basis points (1 bp = 0.01%). 50 bps = 0.5%.
    /// @dev    Immutable at the bytecode level — encoding it as a constant
    ///         keeps it tamper-proof and gas-cheap. To change the fee a new
    ///         versioned `BillingHub` deployment is required, per
    ///         `2_SYSTEM_DESIGN.md` §1.3 ("Immutable core").
    uint256 public constant PROTOCOL_FEE_BPS = 50;

    /// @notice Denominator for `PROTOCOL_FEE_BPS` (basis-point math).
    uint256 internal constant FEE_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------------

    /// @notice Recipient of every protocol fee. Set once at deployment and
    ///         never mutable thereafter, so the protocol cannot redirect
    ///         fees away from the address governance committed to at launch.
    /// @dev    The contract still holds zero balance at rest: every
    ///         `safeTransferFrom` to `treasury` debits the subscriber and
    ///         credits the treasury directly within the same transaction,
    ///         preserving the §0.3 non-custodial invariant.
    address public immutable treasury;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Monotonic plan id counter. Plan id 0 is reserved as "none".
    uint256 public nextPlanId = 1;

    /// @notice planId => Plan metadata.
    mapping(uint256 => Plan) public plans;

    /// @notice planId => subscriber => Subscription state.
    mapping(uint256 => mapping(address => Subscription)) public subscriptions;

    /// @notice keccak256(abi.encode(planId, subscriber)) => SubscriptionLocator.
    /// @dev    Populated on every successful `subscribe()` call. Allows
    ///         `cancel(bytes32 subscriptionId)` to resolve to the underlying
    ///         (planId, subscriber) pair without forcing the caller to pass
    ///         both. Entries are *never* deleted on cancellation — a freed
    ///         locator slot would let an attacker re-mint the same id by
    ///         re-subscribing under collision; keeping the locator pinned
    ///         keeps the id permanently bound to its original wallet.
    mapping(bytes32 => SubscriptionLocator) internal _subscriptionLookup;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploy `BillingHub` and bind it permanently to a treasury.
    /// @dev    The treasury address is captured as `immutable`; there is
    ///         no setter, no admin, and no upgrade path. Reject the zero
    ///         address — a misconfigured deployment would silently burn
    ///         every protocol-fee transfer.
    /// @param  treasury_  Recipient of all `PROTOCOL_FEE_BPS` fees.
    constructor(address treasury_) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted when a merchant publishes a new plan.
    /// @dev First three indexed topics are the actors / scope (planId,
    ///      merchant, token) per AI guidelines §5.
    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        address indexed token,
        uint256 amountPerCycle,
        uint64 cycleLengthSeconds,
        uint32 maxCycles
    );

    /// @notice Emitted when a subscriber commits to a plan via permit.
    event Subscribed(
        uint256 indexed planId,
        address indexed subscriber,
        address indexed merchant,
        uint32 cyclesAuthorized,
        uint64 startTime
    );

    /// @notice Emitted on every successful settlement charge (including the
    ///         atomic first-cycle charge from subscribe()).
    event Charged(
        uint256 indexed planId,
        address indexed subscriber,
        address indexed merchant,
        uint256 amount,
        uint32 cycleNumber,
        uint64 nextChargeTime
    );

    /// @notice Emitted whenever a `PROTOCOL_FEE_BPS` slice is routed from a
    ///         subscriber to the protocol treasury. Indexed on (merchant,
    ///         subscriber) so the off-chain revenue dashboard can group fee
    ///         flow by either party in O(1) without a full event scan.
    /// @dev    Emitted *only* when `feeAmount > 0`. The corresponding
    ///         `Charged` event carries the gross `amountPerCycle`; subtract
    ///         `feeAmount` to derive what the merchant received.
    /// @param  merchant    Recipient of the merchant-side leg of the same
    ///                     settlement (indexed for revenue-by-merchant queries).
    /// @param  subscriber  Wallet that funded both legs of the split.
    /// @param  feeAmount   Token base units forwarded to `treasury`.
    event FeeCollected(
        address indexed merchant,
        address indexed subscriber,
        uint256 feeAmount
    );

    /// @notice Emitted when a subscription is cancelled by either the
    ///         subscriber or the plan's merchant. Once emitted, all future
    ///         `charge()` calls against the same id revert with
    ///         `SubscriptionInactive` — effectively a hard-stop guarantee
    ///         that no further token movement is possible.
    /// @param  subscriptionId  Deterministic id (`subscriptionIdOf(planId, subscriber)`).
    /// @param  cancelledBy     Account that submitted the cancellation tx
    ///                         (always `subscriber` or `plans[planId].merchant`).
    event Cancelled(
        bytes32 indexed subscriptionId,
        address indexed cancelledBy
    );

    // ---------------------------------------------------------------------
    // Merchant API
    // ---------------------------------------------------------------------

    /// @notice Create a new recurring billing plan.
    /// @dev    The caller is recorded as the merchant and is the recipient of
    ///         every future charge. Plans are immutable except for an
    ///         `active` toggle (deactivation method ships in a follow-up).
    ///         Per AI guidelines §4.5, on-chain permit-support validation is
    ///         intentionally NOT performed here — the front-end allow-list
    ///         and runtime DOMAIN_SEPARATOR/nonces probe are authoritative
    ///         for that gate. A merchant who lists a non-permit token will
    ///         simply be unable to attract subscribers via subscribe().
    /// @param  token              ERC-20 token used for charges.
    /// @param  amountPerCycle     Per-cycle charge in token base units.
    /// @param  cycleLengthSeconds Length of one cycle, in seconds.
    /// @param  maxCycles          Hard cap on per-subscriber cycle count.
    /// @return planId             The newly created plan's identifier.
    function createPlan(
        address token,
        uint256 amountPerCycle,
        uint64 cycleLengthSeconds,
        uint32 maxCycles
    ) external returns (uint256 planId) {
        // -- Checks --
        if (token == address(0)) revert InvalidToken();
        if (amountPerCycle == 0) revert InvalidAmount();
        if (cycleLengthSeconds == 0) revert InvalidCycleLength();
        if (maxCycles == 0) revert InvalidMaxCycles();

        // -- Effects --
        planId = nextPlanId;
        unchecked {
            nextPlanId = planId + 1;
        }

        plans[planId] = Plan({
            merchant: msg.sender,
            token: token,
            amountPerCycle: amountPerCycle,
            cycleLengthSeconds: cycleLengthSeconds,
            maxCycles: maxCycles,
            active: true
        });

        // No external interactions in createPlan.
        emit PlanCreated(
            planId, msg.sender, token, amountPerCycle, cycleLengthSeconds, maxCycles
        );
    }

    // ---------------------------------------------------------------------
    // Subscriber API
    // ---------------------------------------------------------------------

    /// @notice Subscribe to a plan with a bounded EIP-2612 permit signature.
    /// @dev    Consumes a permit produced by the front-end
    ///         `usePermitSignature` hook. The permit's `value` MUST equal
    ///         `plan.amountPerCycle * cyclesAuthorized` — anything less and
    ///         the first transferFrom (or a future Gelato charge) will
    ///         revert; anything greater would violate AI guidelines §4.1.
    ///
    ///         Front-running protection: if the existing allowance already
    ///         covers the bounded value, the permit() call is skipped. This
    ///         prevents a griefer from disabling subscribe() by submitting
    ///         the user's permit signature directly to the token contract
    ///         (which would burn the nonce) — we just proceed with the
    ///         transferFrom in that case.
    ///
    ///         CEI ordering (§5): all storage mutations occur before any
    ///         external token call. nonReentrant guards the function because
    ///         it ultimately calls transferFrom on an arbitrary ERC-20.
    ///
    /// @param  planId            The plan to subscribe to.
    /// @param  cyclesAuthorized  Cycles the subscriber permits (1..maxCycles).
    /// @param  permitDeadline    EIP-2612 permit deadline (unix seconds).
    /// @param  permitV           EIP-2612 signature `v` component.
    /// @param  permitR           EIP-2612 signature `r` component.
    /// @param  permitS           EIP-2612 signature `s` component.
    function subscribe(
        uint256 planId,
        uint32 cyclesAuthorized,
        uint256 permitDeadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external nonReentrant {
        // -- Checks --
        Plan memory plan = plans[planId];
        if (plan.merchant == address(0)) revert PlanNotFound();
        if (!plan.active) revert PlanInactive();
        if (cyclesAuthorized == 0 || cyclesAuthorized > plan.maxCycles) {
            revert InvalidCyclesAuthorized();
        }

        Subscription storage sub = subscriptions[planId][msg.sender];
        if (sub.active) revert SubscriptionAlreadyActive();

        uint256 totalAuthorized =
            uint256(plan.amountPerCycle) * uint256(cyclesAuthorized);
        uint64 startTime = uint64(block.timestamp);
        uint64 nextChargeTime = startTime + plan.cycleLengthSeconds;

        // -- Effects (state mutations BEFORE external calls per CEI §5) --
        sub.startTime = startTime;
        sub.nextChargeTime = nextChargeTime;
        sub.cyclesCharged = 1;
        sub.cyclesAuthorized = cyclesAuthorized;
        sub.active = true;

        // Pin the deterministic id => (planId, subscriber) mapping so
        // `cancel(bytes32)` can later resolve the pair without trusting
        // caller-supplied indices. Idempotent re-write on the same slot if
        // the same subscriber re-subscribes after a final-cycle deactivation
        // (the locator value is identical, so no storage churn).
        _subscriptionLookup[_subscriptionId(planId, msg.sender)] =
            SubscriptionLocator({planId: planId, subscriber: msg.sender});

        emit Subscribed(planId, msg.sender, plan.merchant, cyclesAuthorized, startTime);

        // -- Interactions --
        IERC20 token = IERC20(plan.token);

        // Front-running-safe permit. If the allowance is already at or above
        // the bounded total, skip the permit() call so the subscription is
        // not bricked by a griefer who relayed the user's permit signature
        // directly to the token contract.
        if (token.allowance(msg.sender, address(this)) < totalAuthorized) {
            IERC20Permit(plan.token).permit(
                msg.sender,
                address(this),
                totalAuthorized,
                permitDeadline,
                permitV,
                permitR,
                permitS
            );
        }

        // First-cycle charge: same fee split as `charge()` so every cycle —
        // from the activation cycle onwards — generates protocol revenue.
        // `merchantAmount + feeAmount == plan.amountPerCycle` by
        // construction; subscriber is debited exactly `amountPerCycle`,
        // matching the bounded permit value committed off-chain.
        uint256 feeAmount =
            (plan.amountPerCycle * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        uint256 merchantAmount = plan.amountPerCycle - feeAmount;

        // Both legs flow subscriber -> recipient directly. The §0.3
        // non-custodial invariant holds: the contract never receives funds.
        token.safeTransferFrom(msg.sender, plan.merchant, merchantAmount);
        if (feeAmount != 0) {
            token.safeTransferFrom(msg.sender, treasury, feeAmount);
            emit FeeCollected(plan.merchant, msg.sender, feeAmount);
        }

        emit Charged(
            planId, msg.sender, plan.merchant, plan.amountPerCycle, 1, nextChargeTime
        );
    }

    // ---------------------------------------------------------------------
    // Relayer API (permissionless auto-settlement)
    // ---------------------------------------------------------------------

    /// @notice Settle the next-due cycle for an active subscription.
    /// @dev    Permissionless: any address may call. Designed for
    ///         decentralized relayers (Gelato, Pokt, etc) — there is no
    ///         on-chain reward paid by this contract; relayer compensation
    ///         is arranged off-chain.
    ///
    ///         Behaviour:
    ///           - Reverts when the subscription is inactive (never created,
    ///             cancelled, or terminated after the final cycle).
    ///           - Reverts when `block.timestamp < nextChargeTime`.
    ///           - Advances `nextChargeTime` by exactly one
    ///             `cycleLengthSeconds` per call. Late charges (e.g. three
    ///             cycles missed) require three separate `charge()` calls;
    ///             this prevents a single late charge from collapsing
    ///             multiple cycles' worth of debits into one transferFrom.
    ///           - On the final cycle, `active` is set to `false` so a
    ///             follow-up call reverts with `SubscriptionInactive`.
    ///
    ///         Security:
    ///           - `nonReentrant` per AI guidelines §5 (function calls
    ///             `transferFrom` on an arbitrary ERC-20).
    ///           - CEI ordering: storage mutations happen before the token
    ///             interaction.
    ///           - Non-custodial (§0.3): tokens move directly from
    ///             `subscriber` to `plan.merchant`. Protocol balance is
    ///             never touched.
    ///
    /// @param  planId      Plan identifier.
    /// @param  subscriber  Address of the subscriber whose cycle is due.
    function charge(uint256 planId, address subscriber) external nonReentrant {
        // -- Checks --
        Subscription storage sub = subscriptions[planId][subscriber];
        if (!sub.active) revert SubscriptionInactive();
        if (block.timestamp < sub.nextChargeTime) revert ChargeNotDue();

        Plan memory plan = plans[planId];
        uint32 newCycleNumber = sub.cyclesCharged + 1;
        uint64 newNextChargeTime = sub.nextChargeTime + plan.cycleLengthSeconds;

        // Protocol-fee split (0.5% by default). Computed against the cached
        // `plan.amountPerCycle` so the customer is never debited more than
        // the bounded permit value, regardless of `feeAmount` arithmetic.
        // `merchantAmount + feeAmount == plan.amountPerCycle` by
        // construction, so subscribe()-time allowance accounting still holds.
        uint256 feeAmount =
            (plan.amountPerCycle * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        uint256 merchantAmount = plan.amountPerCycle - feeAmount;

        // -- Effects (state mutated BEFORE external calls per CEI §5) --
        sub.cyclesCharged = newCycleNumber;
        sub.nextChargeTime = newNextChargeTime;
        if (newCycleNumber == sub.cyclesAuthorized) {
            // Final cycle — terminate the subscription so any further
            // charge() call reverts cleanly with SubscriptionInactive.
            sub.active = false;
        }

        // -- Interactions --
        // Both legs of the split move directly from `subscriber`. The
        // protocol contract never sits in the value path, preserving the
        // §0.3 non-custodial invariant: protocol token balance stays at 0.
        IERC20 token = IERC20(plan.token);
        token.safeTransferFrom(subscriber, plan.merchant, merchantAmount);
        if (feeAmount != 0) {
            // PROTOCOL_FEE_BPS is a non-zero compile-time constant, so the
            // guard is a defence-in-depth check against an unreachable code
            // path (e.g. `amountPerCycle == 0` is already rejected at plan
            // creation). It also avoids a wasteful zero-value transferFrom
            // on tokens that revert on zero amounts.
            token.safeTransferFrom(subscriber, treasury, feeAmount);
            emit FeeCollected(plan.merchant, subscriber, feeAmount);
        }

        emit Charged(
            planId,
            subscriber,
            plan.merchant,
            plan.amountPerCycle,
            newCycleNumber,
            newNextChargeTime
        );
    }

    // ---------------------------------------------------------------------
    // Cancellation API
    // ---------------------------------------------------------------------

    /// @notice Cancel an active subscription so no further `charge()` can
    ///         succeed against it.
    /// @dev    Authorisation: caller MUST be either the subscriber that
    ///         originally funded the subscription OR the merchant that owns
    ///         the underlying plan. Any other caller reverts with
    ///         `Unauthorized()`.
    ///
    ///         Semantics:
    ///           - Sets `subscriptions[planId][subscriber].active = false`.
    ///             From the next block onwards, `charge()` reverts with
    ///             `SubscriptionInactive` against this id.
    ///           - The locator entry in `_subscriptionLookup` is *retained*
    ///             so the id stays permanently bound to its original
    ///             (planId, subscriber) pair (see storage NatSpec).
    ///           - Re-subscribing under the same (planId, subscriber) pair
    ///             is supported and overwrites the now-inactive Subscription
    ///             struct in the existing storage slot.
    ///
    ///         Non-custodial invariant (§0.3) is trivially preserved: this
    ///         function performs no token transfers — it only flips a flag.
    ///         No `nonReentrant` modifier is required for the same reason,
    ///         but the function is intentionally short and CEI-safe.
    ///
    /// @param  subscriptionId  Deterministic id from `subscriptionIdOf()` or
    ///                         the `_subscriptionId` derivation
    ///                         `keccak256(abi.encode(planId, subscriber))`.
    function cancel(bytes32 subscriptionId) external {
        // -- Checks --
        SubscriptionLocator memory loc = _subscriptionLookup[subscriptionId];
        // A subscriber address of zero means the id was never registered via
        // subscribe() — distinguish this from an "active=false" id so the
        // caller gets an actionable error.
        if (loc.subscriber == address(0)) revert SubscriptionNotFound();

        Subscription storage sub = subscriptions[loc.planId][loc.subscriber];
        // Already inactive — either previously cancelled or naturally
        // exhausted by the final cycle. Either way, there is nothing to do.
        if (!sub.active) revert SubscriptionInactive();

        address merchant = plans[loc.planId].merchant;
        if (msg.sender != loc.subscriber && msg.sender != merchant) {
            revert Unauthorized();
        }

        // -- Effects --
        sub.active = false;

        emit Cancelled(subscriptionId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Pure helper that derives the canonical `bytes32` subscription
    ///         id for a (planId, subscriber) pair.
    /// @dev    Exposed so off-chain integrators (UI, subgraph, indexers) can
    ///         compute the same id the contract uses without re-implementing
    ///         the encoding rule. `abi.encode` (NOT `encodePacked`) avoids
    ///         length-ambiguity collisions across heterogeneous arg types.
    /// @param  planId      Plan identifier.
    /// @param  subscriber  Subscriber wallet.
    /// @return id          Deterministic subscription id.
    function subscriptionIdOf(uint256 planId, address subscriber)
        external
        pure
        returns (bytes32 id)
    {
        id = _subscriptionId(planId, subscriber);
    }

    /// @notice Returns true when a subscription is active for (plan, subscriber).
    /// @param  planId      Plan identifier.
    /// @param  subscriber  Subscriber address.
    /// @return active      Whether the subscription is currently active.
    function isSubscribed(uint256 planId, address subscriber)
        external
        view
        returns (bool active)
    {
        active = subscriptions[planId][subscriber].active;
    }

    /// @notice Returns the bounded remaining allowance the protocol is
    ///         expected to consume for this subscription, in token base units.
    /// @dev    Useful for UIs that show "X of Y cycles remaining" without
    ///         querying the token's `allowance()` directly.
    /// @param  planId      Plan identifier.
    /// @param  subscriber  Subscriber address.
    /// @return remaining   Token base units still authorized for future
    ///                     charges. Returns 0 if the subscription is not
    ///                     active or has been fully consumed.
    function remainingAuthorized(uint256 planId, address subscriber)
        external
        view
        returns (uint256 remaining)
    {
        Subscription memory sub = subscriptions[planId][subscriber];
        if (!sub.active || sub.cyclesCharged >= sub.cyclesAuthorized) {
            return 0;
        }
        uint256 cyclesRemaining = uint256(sub.cyclesAuthorized) - uint256(sub.cyclesCharged);
        remaining = cyclesRemaining * plans[planId].amountPerCycle;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @notice Canonical id derivation for a (planId, subscriber) pair.
    /// @dev    Uses `abi.encode` (NOT `encodePacked`) so the 32-byte
    ///         left-padding of `address` cannot collide with a numerically
    ///         equal `uint256 planId` and vice versa.
    function _subscriptionId(uint256 planId, address subscriber)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(planId, subscriber));
    }
}
