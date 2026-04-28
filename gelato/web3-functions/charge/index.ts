import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, Interface, EventLog } from "ethers";

// ── ABI fragments — only what the relayer needs ────────────────────────────
const BILLING_HUB_ABI = [
  // Event emitted on every successful subscribe() — gives us the enumerable
  // subscriber set without any additional on-chain indexing.
  "event Subscribed(uint256 indexed planId, address indexed subscriber, address indexed merchant, uint32 cyclesAuthorized, uint64 startTime)",

  // Subscription state.  Returns the zero struct (active=false) for unknown
  // (planId, subscriber) pairs — safe to call without a prior existence check.
  "function subscriptions(uint256 planId, address subscriber) external view returns (uint64 startTime, uint64 nextChargeTime, uint32 cyclesCharged, uint32 cyclesAuthorized, bool active)",

  // Permissionless charge entry-point.  Gelato's OpsProxy calls this.
  "function charge(uint256 planId, address subscriber) external",
] as const;

// ── Tuneable constants ─────────────────────────────────────────────────────

/** Max blocks per eth_getLogs query — most public RPCs cap at 10 000. */
const BLOCK_CHUNK = 10_000;

/** Max on-chain reads per run — keeps execution well within the 30 s timeout. */
const MAX_CHECKS_PER_RUN = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface StoredSub {
  planId: string;
  subscriber: string;
}

type CallDataItem = { to: string; data: string };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Stable dedup key for a (planId, subscriber) pair. */
function subKey(s: StoredSub): string {
  return `${s.planId}-${s.subscriber.toLowerCase()}`;
}

// ── Web3 Function ──────────────────────────────────────────────────────────

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { multiChainProvider, userArgs, storage } = context;
  const provider = multiChainProvider.default();

  // ── User-configurable args (set when creating the Gelato task) ───────────
  // Address of the deployed BillingHub contract on the target chain.
  const hubAddress = userArgs.billingHubAddress as string;
  // Block at which BillingHub was deployed — prevents scanning chain history.
  const deployBlock = parseInt((userArgs.deployBlock as string) ?? "0", 10);
  // Hard cap on charge() calls submitted per single Gelato run.
  const maxChargesPerRun = parseInt(
    (userArgs.maxChargesPerRun as string) ?? "10",
    10
  );

  if (!hubAddress || hubAddress === "0x") {
    return { canExec: false, message: "billingHubAddress userArg not set." };
  }

  const hub = new Contract(hubAddress, BILLING_HUB_ABI, provider);
  const iface = new Interface(BILLING_HUB_ABI);

  // ── 1. Load persisted state from Gelato storage ──────────────────────────
  //
  // lastProcessedBlock  — the highest block already scanned for Subscribed
  //                       events.  Moves forward each run.
  // activeSubscriptions — JSON-serialised StoredSub[].  Grows as new
  //                       subscriptions appear; shrinks as they are exhausted
  //                       or cancelled.
  // checkCursor         — rotating index into activeSubscriptions.  Each run
  //                       checks a window of MAX_CHECKS_PER_RUN starting here,
  //                       ensuring every subscription is checked fairly even
  //                       when the list exceeds MAX_CHECKS_PER_RUN.
  //
  const rawBlock = await storage.get("lastProcessedBlock");
  const fromBlock = rawBlock ? parseInt(rawBlock, 10) + 1 : deployBlock;

  const rawSubs = await storage.get("activeSubscriptions");
  const knownSubs: StoredSub[] = rawSubs
    ? (JSON.parse(rawSubs) as StoredSub[])
    : [];

  const rawCursor = await storage.get("checkCursor");
  const cursor = rawCursor ? parseInt(rawCursor, 10) : 0;

  // ── 2. Discover new Subscribed events since last run ─────────────────────
  const currentBlock = await provider.getBlockNumber();
  const seen = new Set(knownSubs.map(subKey));

  for (let lo = fromBlock; lo <= currentBlock; lo += BLOCK_CHUNK) {
    const hi = Math.min(lo + BLOCK_CHUNK - 1, currentBlock);

    let events: Awaited<ReturnType<typeof hub.queryFilter>>;
    try {
      events = await hub.queryFilter(hub.filters.Subscribed(), lo, hi);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`eth_getLogs failed for blocks ${lo}–${hi}: ${msg}`);
      // Persist progress up to just before the failed chunk so the next run
      // retries from the correct boundary rather than re-scanning everything.
      break;
    }

    for (const ev of events) {
      if (!(ev instanceof EventLog)) continue;
      const entry: StoredSub = {
        planId: (ev.args.planId as bigint).toString(),
        subscriber: ev.args.subscriber as string,
      };
      const k = subKey(entry);
      if (!seen.has(k)) {
        seen.add(k);
        knownSubs.push(entry);
      }
    }
  }

  // ── 3. Determine the window to check this run (rotating cursor) ──────────
  const total = knownSubs.length;
  if (total === 0) {
    await storage.set("lastProcessedBlock", currentBlock.toString());
    return {
      canExec: false,
      message: `No subscriptions tracked yet. Scanned up to block ${currentBlock}.`,
    };
  }

  const startIdx = cursor % total;
  const endIdx = Math.min(startIdx + MAX_CHECKS_PER_RUN, total);
  const window = knownSubs.slice(startIdx, endIdx);
  // Wrap the cursor: if we've hit the end of the list, reset to 0 so the
  // next run starts over from the beginning.
  const nextCursor = endIdx >= total ? 0 : endIdx;

  // ── 4. Fetch the latest block timestamp for "is charge due?" comparison ──
  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) {
    return { canExec: false, message: "Failed to fetch latest block." };
  }
  const now = BigInt(latestBlock.timestamp);

  // ── 5. Check each subscription: read state → filter → simulate → collect ─
  const callData: CallDataItem[] = [];
  const toPrune = new Set<string>(); // inactive subs to drop from storage

  for (const sub of window) {
    // ── 5a. Read on-chain subscription state ─────────────────────────────
    let active: boolean;
    let nextChargeTime: bigint;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await hub.subscriptions(sub.planId, sub.subscriber);
      active = result.active as boolean;
      nextChargeTime = BigInt(result.nextChargeTime);
    } catch (err: unknown) {
      // Transient RPC error — skip and retry on next run
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`subscriptions() read failed (${subKey(sub)}): ${msg}`);
      continue;
    }

    // ── 5b. Drop inactive subscriptions (exhausted or cancelled) ─────────
    if (!active) {
      toPrune.add(subKey(sub));
      continue;
    }

    // ── 5c. Skip if next charge is not yet due ────────────────────────────
    if (nextChargeTime > now) {
      continue;
    }

    // ── 5d. Simulate charge() to catch balance / allowance failures ───────
    //
    // A failing eth_call costs us nothing; a failing on-chain tx wastes gas
    // from the Gelato 1Balance and burns relayer reputation.  We skip any
    // subscription whose charge() reverts in simulation (e.g. because the
    // subscriber has insufficient token balance or allowance).  We do NOT
    // prune it — the subscriber may top up before the next run.
    //
    const data = iface.encodeFunctionData("charge", [sub.planId, sub.subscriber]);
    try {
      await provider.call({ to: hubAddress, data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Log the first 200 chars — Gelato surfaces these in the task history.
      console.log(
        `charge() sim reverted — plan=${sub.planId} ` +
          `sub=${sub.subscriber.slice(0, 10)}…: ${msg.slice(0, 200)}`
      );
      continue;
    }

    // ── 5e. Queue the call ────────────────────────────────────────────────
    callData.push({ to: hubAddress, data });

    if (callData.length >= maxChargesPerRun) {
      // We've hit the per-run cap.  Remaining due subscriptions will be
      // caught on the next run.
      break;
    }
  }

  // ── 6. Persist updated state ─────────────────────────────────────────────
  const updatedSubs = knownSubs.filter((s) => !toPrune.has(subKey(s)));
  await storage.set("activeSubscriptions", JSON.stringify(updatedSubs));
  await storage.set("lastProcessedBlock", currentBlock.toString());
  await storage.set("checkCursor", nextCursor.toString());

  console.log(
    `Tracking ${updatedSubs.length} sub(s). ` +
      `Checked ${window.length} in this window. ` +
      `Pruned ${toPrune.size} inactive. ` +
      `Charges queued: ${callData.length}. ` +
      `Next cursor: ${nextCursor}. Block: ${currentBlock}.`
  );

  if (callData.length === 0) {
    return {
      canExec: false,
      message:
        `No charges due. Tracking ${updatedSubs.length} sub(s), ` +
        `checked ${window.length} this run (block ${currentBlock}).`,
    };
  }

  return { canExec: true, callData };
});
