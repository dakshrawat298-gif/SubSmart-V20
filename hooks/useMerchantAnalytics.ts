"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { parseAbiItem, formatUnits } from "viem";
import type { Address } from "viem";
import { getBillingHubAddress } from "@/lib/chain/billingHub";

// ── Event ABI fragment ────────────────────────────────────────────────────────

const CHARGED_EVENT = parseAbiItem(
  "event Charged(uint256 indexed planId, address indexed subscriber, address indexed merchant, uint256 amount, uint32 cycleNumber, uint64 nextChargeTime)"
);

// ── Constants ─────────────────────────────────────────────────────────────────

/** USDC has 6 decimals on Polygon Amoy — used for all revenue formatting. */
const USDC_DECIMALS = 6;

/**
 * Number of buckets in the sparkline. Divides the scanned block window into
 * equal segments so the chart always fills the full width regardless of range.
 */
const SPARKLINE_BUCKETS = 24;

/**
 * How many blocks to scan from tip. Amoy avg block time ≈ 2s → 1 000 blocks
 * ≈ last 33 minutes. Matches the cap used by `useCustomerSubscriptions` so we
 * never trip the node's eth_getLogs range limit.
 */
const SCAN_BLOCKS = 1000n;

// ── Public types ──────────────────────────────────────────────────────────────

export type PerPlanStat = {
  readonly planId: bigint;
  readonly planName: string;
  readonly chargeCount: number;
  /** Human-readable revenue string e.g. "120.00" */
  readonly revenue: string;
};

export type MerchantAnalyticsResult = {
  readonly totalRevenue: string;
  readonly totalCharges: number;
  readonly perPlan: PerPlanStat[];
  /** 24 values in [0, 1] — normalized charge count per block bucket. */
  readonly sparkline: readonly number[];
  /** Approximate number of blocks scanned (for the "Last N blocks" label). */
  readonly scannedBlocks: number;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all `Charged` events where `merchant === account` from BillingHub,
 * then computes aggregate revenue, per-plan breakdowns, and a sparkline.
 *
 * Algorithm mirrors `useCustomerSubscriptions`:
 *   1. getBlockNumber() → derive safe fromBlock (tip - SCAN_BLOCKS).
 *   2. getLogs(Charged, args.merchant = account) → raw log array.
 *   3. Aggregate total revenue, per-plan map, and bucket counts for sparkline.
 *   4. Normalise sparkline values to [0, 1].
 *
 * `planNames` is a map from planId string to human-readable name (supplied by
 * the caller from localStorage) — enriches per-plan rows without an extra RPC.
 */
export function useMerchantAnalytics(
  planNames: ReadonlyMap<string, string>
): MerchantAnalyticsResult {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hubAddress = getBillingHubAddress(chainId);

  const EMPTY_SPARKLINE = Object.freeze(
    new Array<number>(SPARKLINE_BUCKETS).fill(0)
  );

  const [totalRevenue, setTotalRevenue] = useState("0.00");
  const [totalCharges, setTotalCharges] = useState(0);
  const [perPlan, setPerPlan] = useState<PerPlanStat[]>([]);
  const [sparkline, setSparkline] =
    useState<readonly number[]>(EMPTY_SPARKLINE);
  const [scannedBlocks, setScannedBlocks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConnected || !account || !hubAddress || !publicClient) {
      setTotalRevenue("0.00");
      setTotalCharges(0);
      setPerPlan([]);
      setSparkline(EMPTY_SPARKLINE);
      setScannedBlocks(0);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // ── 1. Derive safe block window ──────────────────────────────────
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock =
          currentBlock > SCAN_BLOCKS ? currentBlock - SCAN_BLOCKS : 0n;
        const blockWindow = Number(currentBlock - fromBlock);

        // ── 2. Fetch Charged events for this merchant ────────────────────
        const logs = await publicClient.getLogs({
          address: hubAddress as Address,
          event: CHARGED_EVENT,
          args: { merchant: account },
          fromBlock,
          toBlock: "latest",
        });

        if (cancelled) return;

        // ── 3. Aggregate: totals, per-plan map, sparkline buckets ────────
        let totalRaw = 0n;
        const planMap = new Map<
          string,
          { planId: bigint; chargeCount: number; revenueRaw: bigint }
        >();
        const bucketCounts = new Array<number>(SPARKLINE_BUCKETS).fill(0);
        const bucketSize = blockWindow / SPARKLINE_BUCKETS;

        for (const log of logs) {
          const amount = log.args.amount ?? 0n;
          const planId = log.args.planId ?? 0n;
          const key = planId.toString();

          totalRaw += amount;

          const entry = planMap.get(key);
          if (entry) {
            entry.chargeCount++;
            entry.revenueRaw += amount;
          } else {
            planMap.set(key, { planId, chargeCount: 1, revenueRaw: amount });
          }

          // Assign to sparkline bucket by block offset from window start
          if (log.blockNumber !== null && bucketSize > 0) {
            const offset = Number(log.blockNumber - fromBlock);
            const bucket = Math.min(
              Math.floor(offset / bucketSize),
              SPARKLINE_BUCKETS - 1
            );
            bucketCounts[bucket]++;
          }
        }

        // ── 4. Normalise sparkline values ────────────────────────────────
        const peak = Math.max(...bucketCounts, 1);
        const normalised = bucketCounts.map((c) => c / peak);

        // ── 5. Build per-plan list (descending revenue) ──────────────────
        const perPlanResult: PerPlanStat[] = [...planMap.values()]
          .sort((a, b) => (b.revenueRaw > a.revenueRaw ? 1 : -1))
          .map(({ planId, chargeCount, revenueRaw }) => ({
            planId,
            planName:
              planNames.get(planId.toString()) ?? `Plan #${planId.toString()}`,
            chargeCount,
            revenue: formatUnits(revenueRaw, USDC_DECIMALS),
          }));

        if (!cancelled) {
          setTotalRevenue(formatUnits(totalRaw, USDC_DECIMALS));
          setTotalCharges(logs.length);
          setPerPlan(perPlanResult);
          setSparkline(Object.freeze(normalised));
          setScannedBlocks(blockWindow);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load analytics."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // planNames is a Map passed by reference — changes to its contents won't
    // retrigger this effect. That's intentional: plan names update from
    // localStorage only; the analytics refetch is explicit via refetch().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, isConnected, hubAddress, publicClient, fetchTick]);

  return {
    totalRevenue,
    totalCharges,
    perPlan,
    sparkline,
    scannedBlocks,
    isLoading,
    error,
    refetch,
  };
}
