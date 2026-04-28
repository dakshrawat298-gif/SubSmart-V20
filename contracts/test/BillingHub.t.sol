// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {BillingHub} from "../src/BillingHub.sol";
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "openzeppelin-contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice 6-decimal mock ERC-20 with EIP-2612 Permit, used to produce
///         deterministic signatures for BillingHub tests via vm.sign().
contract MockERC20Permit is ERC20Permit {
    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @notice Unit + branch tests for BillingHub.sol covering the constructor,
///         createPlan, subscribe, and the relayer-facing charge() function,
///         including the 0.5% protocol fee split and FeeCollected event.
contract BillingHubTest is Test {
    BillingHub internal hub;
    MockERC20Permit internal token;

    address internal merchant = address(0xBEEF);
    address internal relayer = address(0xCAFE);
    address internal treasury = address(0x7E5);

    uint256 internal subscriberPk = uint256(keccak256("subscriber"));
    address internal subscriber;

    uint256 internal otherPk = uint256(keccak256("other"));
    address internal otherSubscriber;

    uint256 internal constant AMOUNT_PER_CYCLE = 10e6; // 10 mUSDC
    uint64 internal constant CYCLE_LENGTH = 30 days;
    uint32 internal constant MAX_CYCLES = 12;

    // Derived from PROTOCOL_FEE_BPS = 50 / FEE_DENOMINATOR = 10_000.
    uint256 internal constant FEE_PER_CYCLE = (AMOUNT_PER_CYCLE * 50) / 10_000;
    uint256 internal constant MERCHANT_PER_CYCLE = AMOUNT_PER_CYCLE - FEE_PER_CYCLE;

    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        address indexed token,
        uint256 amountPerCycle,
        uint64 cycleLengthSeconds,
        uint32 maxCycles
    );
    event Subscribed(
        uint256 indexed planId,
        address indexed subscriber,
        address indexed merchant,
        uint32 cyclesAuthorized,
        uint64 startTime
    );
    event Charged(
        uint256 indexed planId,
        address indexed subscriber,
        address indexed merchant,
        uint256 amount,
        uint32 cycleNumber,
        uint64 nextChargeTime
    );
    event FeeCollected(
        address indexed merchant,
        address indexed subscriber,
        uint256 feeAmount
    );

    function setUp() public {
        hub = new BillingHub(treasury);
        token = new MockERC20Permit();
        subscriber = vm.addr(subscriberPk);
        otherSubscriber = vm.addr(otherPk);
        token.mint(subscriber, 1_000_000e6);
        token.mint(otherSubscriber, 1_000_000e6);
        // Sane non-zero starting timestamp for warp-based tests.
        vm.warp(1_700_000_000);
    }

    // ---------------------------------------------------------------- helpers

    function _signPermit(uint256 pk, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        address owner = vm.addr(pk);
        uint256 nonce = token.nonces(owner);
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(pk, digest);
    }

    function _createDefaultPlan() internal returns (uint256 planId) {
        vm.prank(merchant);
        planId = hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
    }

    function _subscribeFull(uint256 planId, uint256 pk) internal {
        address sub = vm.addr(pk);
        uint32 cycles = MAX_CYCLES;
        uint256 value = AMOUNT_PER_CYCLE * uint256(cycles);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(pk, address(hub), value, deadline);
        vm.prank(sub);
        hub.subscribe(planId, cycles, deadline, v, r, s);
    }

    /// @dev BillingHub has no on-chain deactivatePlan() yet, so this test
    ///      helper flips the active flag via direct storage manipulation.
    ///      Storage layout (verified after the constants/immutables refactor):
    ///        slot 0: ReentrancyGuard._status (uint256)
    ///        Constants and immutables live in code, NOT storage.
    ///        slot 1: BillingHub.nextPlanId (uint256)
    ///        slot 2: plans mapping pointer
    ///        slot 3: subscriptions mapping pointer
    ///      Plan struct slots (relative to keccak256(planId, 2)):
    ///        +0: merchant (20)
    ///        +1: token (20)
    ///        +2: amountPerCycle (32)
    ///        +3: { cycleLengthSeconds(8) | maxCycles(4) | active(1) }
    ///      `active` occupies bits 96..103 of slot +3.
    function _deactivatePlan(uint256 planId) internal {
        bytes32 base = keccak256(abi.encode(planId, uint256(2)));
        bytes32 packedSlot = bytes32(uint256(base) + 3);
        bytes32 cur = vm.load(address(hub), packedSlot);
        bytes32 mask = bytes32(uint256(0xff) << 96);
        vm.store(address(hub), packedSlot, cur & ~mask);
    }

    // --------------------------------------------------------------- constants

    function test_Constants_FeeBpsAndDenominator() public view {
        assertEq(hub.PROTOCOL_FEE_BPS(), 50);
        // Sanity: 10 mUSDC * 50 / 10_000 == 50_000 base units (== 0.05 mUSDC).
        assertEq(FEE_PER_CYCLE, 50_000);
        assertEq(MERCHANT_PER_CYCLE, 9_950_000);
    }

    // ------------------------------------------------------------ constructor

    function test_Constructor_SetsTreasury() public view {
        assertEq(hub.treasury(), treasury);
    }

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(BillingHub.InvalidTreasury.selector);
        new BillingHub(address(0));
    }

    // ----------------------------------------------------------- createPlan

    function test_CreatePlan_HappyPath() public {
        vm.expectEmit(true, true, true, true);
        emit PlanCreated(1, merchant, address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
        vm.prank(merchant);
        uint256 planId =
            hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
        assertEq(planId, 1);
        assertEq(hub.nextPlanId(), 2);

        (address m, address t, uint256 a, uint64 cl, uint32 mc, bool active) = hub.plans(planId);
        assertEq(m, merchant);
        assertEq(t, address(token));
        assertEq(a, AMOUNT_PER_CYCLE);
        assertEq(cl, CYCLE_LENGTH);
        assertEq(mc, MAX_CYCLES);
        assertTrue(active);
    }

    function test_CreatePlan_RevertsOnZeroToken() public {
        vm.expectRevert(BillingHub.InvalidToken.selector);
        hub.createPlan(address(0), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
    }

    function test_CreatePlan_RevertsOnZeroAmount() public {
        vm.expectRevert(BillingHub.InvalidAmount.selector);
        hub.createPlan(address(token), 0, CYCLE_LENGTH, MAX_CYCLES);
    }

    function test_CreatePlan_RevertsOnZeroCycleLength() public {
        vm.expectRevert(BillingHub.InvalidCycleLength.selector);
        hub.createPlan(address(token), AMOUNT_PER_CYCLE, 0, MAX_CYCLES);
    }

    function test_CreatePlan_RevertsOnZeroMaxCycles() public {
        vm.expectRevert(BillingHub.InvalidMaxCycles.selector);
        hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, 0);
    }

    function test_CreatePlan_IdsIncrement() public {
        vm.startPrank(merchant);
        uint256 a = hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
        uint256 b = hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, MAX_CYCLES);
        vm.stopPrank();
        assertEq(a, 1);
        assertEq(b, 2);
    }

    // ------------------------------------------------------------- subscribe

    function test_Subscribe_HappyPath_FullCycles_FeeSplit() public {
        uint256 planId = _createDefaultPlan();
        uint256 value = AMOUNT_PER_CYCLE * uint256(MAX_CYCLES);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);

        uint256 mBalBefore = token.balanceOf(merchant);
        uint256 tBalBefore = token.balanceOf(treasury);
        uint256 sBalBefore = token.balanceOf(subscriber);

        vm.expectEmit(true, true, true, true);
        emit Subscribed(planId, subscriber, merchant, MAX_CYCLES, uint64(block.timestamp));
        vm.expectEmit(true, true, true, true);
        emit FeeCollected(merchant, subscriber, FEE_PER_CYCLE);
        vm.expectEmit(true, true, true, true);
        emit Charged(
            planId,
            subscriber,
            merchant,
            AMOUNT_PER_CYCLE,
            1,
            uint64(block.timestamp) + CYCLE_LENGTH
        );

        vm.prank(subscriber);
        hub.subscribe(planId, MAX_CYCLES, deadline, v, r, s);

        (uint64 startTime, uint64 nextChargeTime, uint32 charged, uint32 auth, bool active) =
            hub.subscriptions(planId, subscriber);
        assertEq(startTime, block.timestamp);
        assertEq(nextChargeTime, block.timestamp + CYCLE_LENGTH);
        assertEq(charged, 1);
        assertEq(auth, MAX_CYCLES);
        assertTrue(active);

        // 99.5% to merchant, 0.5% to treasury, customer debited the gross.
        assertEq(token.balanceOf(merchant), mBalBefore + MERCHANT_PER_CYCLE);
        assertEq(token.balanceOf(treasury), tBalBefore + FEE_PER_CYCLE);
        assertEq(token.balanceOf(subscriber), sBalBefore - AMOUNT_PER_CYCLE);
        assertEq(token.balanceOf(address(hub)), 0); // non-custodial invariant
        // Allowance debited by both legs (merchantAmount + feeAmount == amountPerCycle).
        assertEq(token.allowance(subscriber, address(hub)), value - AMOUNT_PER_CYCLE);
    }

    function test_Subscribe_HappyPath_PartialCycles() public {
        uint256 planId = _createDefaultPlan();
        uint32 cycles = 3;
        uint256 value = AMOUNT_PER_CYCLE * uint256(cycles);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);

        vm.prank(subscriber);
        hub.subscribe(planId, cycles, deadline, v, r, s);

        (,, uint32 charged, uint32 auth, bool active) = hub.subscriptions(planId, subscriber);
        assertEq(charged, 1);
        assertEq(auth, cycles);
        assertTrue(active);
        // After the first-cycle charge, two cycles' worth of token base
        // units remain authorized for the protocol to consume.
        assertEq(hub.remainingAuthorized(planId, subscriber), AMOUNT_PER_CYCLE * (cycles - 1));
    }

    function test_Subscribe_RevertsOnUnknownPlan() public {
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(subscriberPk, address(hub), AMOUNT_PER_CYCLE, deadline);
        vm.expectRevert(BillingHub.PlanNotFound.selector);
        vm.prank(subscriber);
        hub.subscribe(999, 1, deadline, v, r, s);
    }

    function test_Subscribe_RevertsOnInactivePlan() public {
        uint256 planId = _createDefaultPlan();
        _deactivatePlan(planId);
        (,,,,, bool active) = hub.plans(planId);
        assertFalse(active);

        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(subscriberPk, address(hub), AMOUNT_PER_CYCLE, deadline);
        vm.expectRevert(BillingHub.PlanInactive.selector);
        vm.prank(subscriber);
        hub.subscribe(planId, 1, deadline, v, r, s);
    }

    function test_Subscribe_RevertsOnZeroCycles() public {
        uint256 planId = _createDefaultPlan();
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), 0, deadline);
        vm.expectRevert(BillingHub.InvalidCyclesAuthorized.selector);
        vm.prank(subscriber);
        hub.subscribe(planId, 0, deadline, v, r, s);
    }

    function test_Subscribe_RevertsOnTooManyCycles() public {
        uint256 planId = _createDefaultPlan();
        uint32 cycles = MAX_CYCLES + 1;
        uint256 value = AMOUNT_PER_CYCLE * uint256(cycles);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);
        vm.expectRevert(BillingHub.InvalidCyclesAuthorized.selector);
        vm.prank(subscriber);
        hub.subscribe(planId, cycles, deadline, v, r, s);
    }

    function test_Subscribe_RevertsOnDoubleSubscribe() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);

        uint256 value = AMOUNT_PER_CYCLE * uint256(MAX_CYCLES);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);
        vm.expectRevert(BillingHub.SubscriptionAlreadyActive.selector);
        vm.prank(subscriber);
        hub.subscribe(planId, MAX_CYCLES, deadline, v, r, s);
    }

    function test_Subscribe_FrontRunningProtection_PermitSkippedWhenAllowanceSufficient() public {
        // Simulate a griefer who relayed the user's permit signature directly
        // to the token (burning the nonce). Allowance is now set; the dApp's
        // permit() call would otherwise revert on a stale nonce. BillingHub
        // detects this and skips permit(), proceeding straight to the first
        // transferFrom — the subscription is NOT bricked.
        uint256 planId = _createDefaultPlan();
        uint256 value = AMOUNT_PER_CYCLE * uint256(MAX_CYCLES);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);

        // "Griefer" relays the permit directly.
        token.permit(subscriber, address(hub), value, deadline, v, r, s);
        assertEq(token.allowance(subscriber, address(hub)), value);

        // subscribe() with deliberately invalid signature components — proves
        // the permit() call is NOT made (otherwise this would revert).
        vm.prank(subscriber);
        hub.subscribe(planId, MAX_CYCLES, deadline, 27, bytes32(0), bytes32(0));

        (,, uint32 charged,, bool active) = hub.subscriptions(planId, subscriber);
        assertEq(charged, 1);
        assertTrue(active);
        // Both legs of the fee split debited the existing allowance.
        assertEq(token.balanceOf(merchant), MERCHANT_PER_CYCLE);
        assertEq(token.balanceOf(treasury), FEE_PER_CYCLE);
    }

    function test_Subscribe_TwoSubscribersSamePlan_FeeAccrues() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);
        _subscribeFull(planId, otherPk);

        (,,,, bool a1) = hub.subscriptions(planId, subscriber);
        (,,,, bool a2) = hub.subscriptions(planId, otherSubscriber);
        assertTrue(a1);
        assertTrue(a2);
        // Treasury collected one fee per first-cycle charge.
        assertEq(token.balanceOf(treasury), 2 * FEE_PER_CYCLE);
        assertEq(token.balanceOf(merchant), 2 * MERCHANT_PER_CYCLE);
    }

    function test_Subscribe_RoundsDownToZeroFee_NoEventEmitted() public {
        // amountPerCycle = 199 base units. 199 * 50 / 10_000 = 0 (integer
        // division). The fee leg must be skipped so we don't waste gas /
        // emit a no-op event, AND no zero-value safeTransferFrom is sent
        // (some hostile ERC-20s revert on zero amounts).
        uint256 tinyAmount = 199;
        vm.prank(merchant);
        uint256 planId = hub.createPlan(address(token), tinyAmount, CYCLE_LENGTH, 1);

        uint256 value = tinyAmount;
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), value, deadline);

        // Recording logs lets us assert the exact event topology.
        vm.recordLogs();
        vm.prank(subscriber);
        hub.subscribe(planId, 1, deadline, v, r, s);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 feeTopic = keccak256("FeeCollected(address,address,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != feeTopic, "FeeCollected must not emit at zero fee");
        }
        assertEq(token.balanceOf(merchant), tinyAmount); // 100% to merchant
        assertEq(token.balanceOf(treasury), 0);
    }

    // ---------------------------------------------------------------- charge

    function test_Charge_RevertsOnInactiveSubscription() public {
        uint256 planId = _createDefaultPlan();
        // No subscribe call — subscription is the zero struct.
        vm.expectRevert(BillingHub.SubscriptionInactive.selector);
        hub.charge(planId, subscriber);
    }

    function test_Charge_RevertsBeforeNextChargeTime() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);
        // nextChargeTime is now + CYCLE_LENGTH; not yet due.
        vm.expectRevert(BillingHub.ChargeNotDue.selector);
        hub.charge(planId, subscriber);
    }

    function test_Charge_HappyPath_AnyoneCanRelay_FeeSplit() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);

        uint64 firstNext = uint64(block.timestamp) + CYCLE_LENGTH;
        vm.warp(firstNext);
        uint64 expectedNext = firstNext + CYCLE_LENGTH;

        uint256 mBalBefore = token.balanceOf(merchant);
        uint256 tBalBefore = token.balanceOf(treasury);

        vm.expectEmit(true, true, true, true);
        emit FeeCollected(merchant, subscriber, FEE_PER_CYCLE);
        vm.expectEmit(true, true, true, true);
        emit Charged(planId, subscriber, merchant, AMOUNT_PER_CYCLE, 2, expectedNext);

        // A third party (not subscriber, not merchant) acts as the relayer.
        vm.prank(relayer);
        hub.charge(planId, subscriber);

        (, uint64 nextChargeTime, uint32 charged,, bool active) =
            hub.subscriptions(planId, subscriber);
        assertEq(nextChargeTime, expectedNext);
        assertEq(charged, 2);
        assertTrue(active);
        assertEq(token.balanceOf(merchant), mBalBefore + MERCHANT_PER_CYCLE);
        assertEq(token.balanceOf(treasury), tBalBefore + FEE_PER_CYCLE);
        assertEq(token.balanceOf(address(hub)), 0); // non-custodial
    }

    function test_Charge_FinalCycleDeactivates() public {
        // Plan with 2 cycles for a fast end-state.
        vm.prank(merchant);
        uint256 planId = hub.createPlan(address(token), AMOUNT_PER_CYCLE, CYCLE_LENGTH, 2);

        uint32 cycles = 2;
        uint256 value = AMOUNT_PER_CYCLE * uint256(cycles);
        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(subscriberPk, address(hub), value, deadline);
        vm.prank(subscriber);
        hub.subscribe(planId, cycles, deadline, v, r, s);

        // Cycle 2 — the final one.
        vm.warp(block.timestamp + CYCLE_LENGTH);
        hub.charge(planId, subscriber);

        (,, uint32 charged,, bool active) = hub.subscriptions(planId, subscriber);
        assertEq(charged, 2);
        assertFalse(active);
        assertEq(hub.remainingAuthorized(planId, subscriber), 0);

        // Treasury / merchant accumulated exactly two cycles' worth.
        assertEq(token.balanceOf(treasury), 2 * FEE_PER_CYCLE);
        assertEq(token.balanceOf(merchant), 2 * MERCHANT_PER_CYCLE);

        // Subsequent charge fails because subscription is now inactive.
        vm.warp(block.timestamp + CYCLE_LENGTH);
        vm.expectRevert(BillingHub.SubscriptionInactive.selector);
        hub.charge(planId, subscriber);
    }

    function test_Charge_ConsecutiveCyclesAdvanceState_FeeSums() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);

        for (uint32 i = 2; i <= MAX_CYCLES; i++) {
            vm.warp(block.timestamp + CYCLE_LENGTH);
            hub.charge(planId, subscriber);
            (,, uint32 charged,,) = hub.subscriptions(planId, subscriber);
            assertEq(charged, i);
        }

        (,,,, bool active) = hub.subscriptions(planId, subscriber);
        assertFalse(active);
        // Across MAX_CYCLES cycles: merchant got 99.5%, treasury got 0.5%,
        // hub never custodied a single base unit.
        assertEq(token.balanceOf(merchant), uint256(MAX_CYCLES) * MERCHANT_PER_CYCLE);
        assertEq(token.balanceOf(treasury), uint256(MAX_CYCLES) * FEE_PER_CYCLE);
        assertEq(
            token.balanceOf(merchant) + token.balanceOf(treasury),
            uint256(MAX_CYCLES) * AMOUNT_PER_CYCLE
        );
        assertEq(token.balanceOf(address(hub)), 0);
    }

    function test_Charge_RevertsWhenSubscriberBalanceInsufficient() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);

        // Drain the subscriber's wallet. Capture the balance BEFORE the
        // prank — `balanceOf` would otherwise consume the prank.
        uint256 bal = token.balanceOf(subscriber);
        vm.prank(subscriber);
        token.transfer(address(0xDEAD), bal);

        vm.warp(block.timestamp + CYCLE_LENGTH);
        // SafeERC20 bubbles up the underlying ERC20InsufficientBalance error.
        vm.expectRevert();
        hub.charge(planId, subscriber);

        // State unchanged on revert.
        (,, uint32 charged,, bool active) = hub.subscriptions(planId, subscriber);
        assertEq(charged, 1);
        assertTrue(active);
    }

    function test_Charge_AfterMissedCycles_StillAdvancesByOne() public {
        uint256 planId = _createDefaultPlan();
        _subscribeFull(planId, subscriberPk);

        // Skip far ahead — three cycles late. The relayer can only settle
        // one cycle per call; nextChargeTime advances by exactly one period.
        uint64 firstNext = uint64(block.timestamp) + CYCLE_LENGTH;
        vm.warp(firstNext + 3 * CYCLE_LENGTH);
        hub.charge(planId, subscriber);

        (, uint64 nextChargeTime, uint32 charged,,) = hub.subscriptions(planId, subscriber);
        assertEq(charged, 2);
        assertEq(nextChargeTime, firstNext + CYCLE_LENGTH);
        // Two fees accrued total: cycle 1 (subscribe()) + cycle 2 (charge()).
        // No retroactive double-charging — only ONE charge() advanced state.
        assertEq(token.balanceOf(treasury), 2 * FEE_PER_CYCLE);
    }

    // ------------------------------------------------------------ views

    function test_IsSubscribed_TracksLifecycle() public {
        uint256 planId = _createDefaultPlan();
        assertFalse(hub.isSubscribed(planId, subscriber));
        _subscribeFull(planId, subscriberPk);
        assertTrue(hub.isSubscribed(planId, subscriber));
    }

    function test_RemainingAuthorized_ReturnsZeroForUnknownSubscription() public {
        uint256 planId = _createDefaultPlan();
        assertEq(hub.remainingAuthorized(planId, subscriber), 0);
    }

    // ----------------------------------------------------- fuzz: fee math

    /// @notice Fuzz the closed-form fee math against the contract's actual
    ///         transfer behaviour for a single charge. Bounds are picked so
    ///         the subscriber's mint covers the cycle and the multiplication
    ///         cannot overflow (`amount` ≤ 2^96 keeps fee calc safe).
    function testFuzz_Charge_FeeSplitMatchesFormula(uint256 amount) public {
        amount = bound(amount, 1, type(uint96).max);
        // Top up so the subscriber definitely has enough to cover one cycle.
        token.mint(subscriber, amount);

        vm.prank(merchant);
        uint256 planId = hub.createPlan(address(token), amount, CYCLE_LENGTH, 1);

        uint256 deadline = block.timestamp + 365 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(subscriberPk, address(hub), amount, deadline);

        uint256 mBalBefore = token.balanceOf(merchant);
        uint256 tBalBefore = token.balanceOf(treasury);

        vm.prank(subscriber);
        hub.subscribe(planId, 1, deadline, v, r, s);

        uint256 expectedFee = (amount * 50) / 10_000;
        uint256 expectedMerchant = amount - expectedFee;
        assertEq(token.balanceOf(merchant) - mBalBefore, expectedMerchant);
        assertEq(token.balanceOf(treasury) - tBalBefore, expectedFee);
        assertEq(token.balanceOf(address(hub)), 0);
    }
}

/// @notice Randomised handler for the BillingHub invariant suite. Drives
///         createPlan / subscribe / charge sequences and exposes the protocol
///         to the `protocolBalanceIsZero` and `treasuryConservation`
///         invariants after every call.
contract BillingHubHandler is Test {
    BillingHub public hub;
    MockERC20Permit public token;
    address public subscriber;
    address public merchant = address(0xBEEF);

    uint256[] public planIds;

    /// @notice Cumulative tokens the subscriber has spent through the
    ///         protocol. The conservation invariant uses this to assert that
    ///         every base unit ends up at either `merchant` or `treasury`.
    uint256 public totalSpent;

    constructor(BillingHub _hub, MockERC20Permit _token, address _subscriber) {
        hub = _hub;
        token = _token;
        subscriber = _subscriber;
    }

    function createAndSubscribe(
        uint256 amount,
        uint256 cycleLen,
        uint32 maxCycles,
        uint32 cyclesAuth
    ) external {
        amount = bound(amount, 1, 100e6);
        uint64 cycleLenBounded = uint64(bound(cycleLen, 60, 30 days));
        maxCycles = uint32(bound(maxCycles, 1, 24));
        cyclesAuth = uint32(bound(cyclesAuth, 1, maxCycles));

        vm.prank(merchant);
        uint256 planId =
            hub.createPlan(address(token), amount, cycleLenBounded, maxCycles);

        // Top up allowance so the front-running-protection branch in
        // subscribe() bypasses the permit call. This keeps the handler from
        // needing to forge valid EIP-712 signatures during fuzzing.
        uint256 value = amount * uint256(cyclesAuth);
        uint256 cur = token.allowance(subscriber, address(hub));
        vm.prank(subscriber);
        token.approve(address(hub), cur + value);

        vm.prank(subscriber);
        try hub.subscribe(
            planId, cyclesAuth, block.timestamp + 365 days, 27, bytes32(0), bytes32(0)
        ) {
            planIds.push(planId);
            totalSpent += amount; // First-cycle charge succeeded.
        } catch {
            // Same subscriber may already have an active sub for this id; ignore.
        }
    }

    function chargeRandom(uint256 idx, uint256 timeJump) external {
        if (planIds.length == 0) return;
        idx = bound(idx, 0, planIds.length - 1);
        timeJump = bound(timeJump, 1, 60 days);
        vm.warp(block.timestamp + timeJump);
        // Read the per-cycle amount BEFORE the call so we can credit
        // totalSpent only on success.
        (,, uint256 amount,,,) = hub.plans(planIds[idx]);
        try hub.charge(planIds[idx], subscriber) {
            totalSpent += amount;
        } catch {}
    }
}

/// @notice Invariant suite. The protocol must:
///           1. Hold zero subscription tokens at all times (§0.3).
///           2. Conserve every base unit the subscriber spends — sum of
///              merchant + treasury balances must equal cumulative spend.
contract BillingHubInvariantTest is Test {
    BillingHub public hub;
    MockERC20Permit public token;
    BillingHubHandler public handler;
    address public subscriber;
    address public merchant = address(0xBEEF);
    address public treasury = address(0x7E5);

    function setUp() public {
        hub = new BillingHub(treasury);
        token = new MockERC20Permit();
        subscriber = address(0xC0FFEE);
        token.mint(subscriber, 1_000_000_000e6);
        handler = new BillingHubHandler(hub, token, subscriber);
        targetContract(address(handler));
    }

    /// @notice The protocol contract MUST hold zero subscription tokens at
    ///         all times. Funds always go subscriber → merchant + treasury.
    function invariant_ProtocolBalanceIsZero() public view {
        assertEq(token.balanceOf(address(hub)), 0);
    }

    /// @notice Every base unit the subscriber spent through the protocol must
    ///         have landed at either the merchant or the treasury — nothing
    ///         is ever burned, lost, or stuck inside the contract.
    function invariant_TreasuryAndMerchantConserveSpend() public view {
        assertEq(
            token.balanceOf(merchant) + token.balanceOf(treasury),
            handler.totalSpent()
        );
    }
}
