"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { parseAbiItem, formatUnits } from "viem";
import type { Address } from "viem";
import { getBillingHubAddress } from "@/lib/chain/billingHub";
import { toast } from "@/lib/toast";

// ── Event ABI fragment ────────────────────────────────────────────────────────

const CHARGED_EVENT = parseAbiItem(
  "event Charged(uint256 indexed planId, address indexed subscriber, address indexed merchant, uint256 amount, uint32 cycleNumber, uint64 nextChargeTime)"
);

// ── Constants ─────────────────────────────────────────────────────────────────

const USDC_DECIMALS = 6;
const SPARKLINE_BUCKETS = 24;

/**
 * 200 blocks ≈ 6 min on Polygon Amoy (2 s avg block time).
 *
 * Free public Amoy RPC nodes have a very low eth_getLogs range cap.
 * 200 blocks stays well inside that limit while still capturing recent
 * on-chain activity. The panel is explicitly labelled "recent blocks" so
 * the narrow window is transparent to the merchant.
 */
const SCAN_BLOCKS = 200n;

// ── Public types ──────────────────────────────────────────────────────────────

export type PerPlanStat = {
  readonly planId: bigint;
  readonly planName: string;
  readonly chargeCount: number;
  readonly revenue: string;
};

export type MerchantAnalyticsResult = {
  readonly totalRevenue: string;
  readonly totalCharges: number;
  readonly perPlan: PerPlanStat[];
  /** 24 values in [0, 1] — normalised charge count per block bucket. */
  readonly sparkline: readonly number[];
  /** Approximate number of blocks that were scanned. */
  readonly scannedBlocks: number;
  readonly isLoading: boolean;
  readonly refetch: () => void;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches `Charged` events where `merchant === account` from BillingHub,
 * computes aggregate revenue, per-plan breakdowns, and a sparkline.
 *
 * Error strategy: ALL failures are routed to the global toast notification
 * system (lib/toast.ts). The hook never surfaces an error string into the
 * component tree — on failure the panel gracefully displays $0.00.
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
      return;
    }

    let cancelled = false;

    void (async (): Promise<void> => {
      setIsLoading(true);

      try {
        // ── 1. Derive safe block window (500 blocks, well within RPC cap) ──
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock =
          currentBlock > SCAN_BLOCKS ? currentBlock - SCAN_BLOCKS : 0n;
        const blockWindow = Number(currentBlock - fromBlock);

        // ── 2. Fetch Charged events for this merchant address ────────────
        const logs = await publicClient.getLogs({
          address: hubAddress as Address,
          event: CHARGED_EVENT,
          args: { merchant: account },
          fromBlock,
          toBlock: "latest",
        });

        if (cancelled) return;

        // ── 3. Aggregate totals, per-plan map, sparkline buckets ─────────
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

          if (log.blockNumber !== null && bucketSize > 0) {
            const offset = Number(log.blockNumber - fromBlock);
            const bucket = Math.min(
              Math.floor(offset / bucketSize),
              SPARKLINE_BUCKETS - 1
            );
            bucketCounts[bucket]++;
          }
        }

        // ── 4. Normalise sparkline ────────────────────────────────────────
        const peak = Math.max(...bucketCounts, 1);
        const normalised = bucketCounts.map((c) => c / peak);

        // ── 5. Build per-plan list (descending revenue) ───────────────────
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
        // Log the raw technical error for debugging only — never surface it
        // to the user. The panel stays at $0.00 and a clean message is shown.
        console.error("[MerchantAnalytics] getLogs failed:", err);
        if (!cancelled) {
          toast.error("Analytics sync delayed. Please try refreshing.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, isConnected, hubAddress, publicClient, fetchTick]);

  return {
    totalRevenue,
    totalCharges,
    perPlan,
    sparkline,
    scannedBlocks,
    isLoading,
    refetch,
  };
}
