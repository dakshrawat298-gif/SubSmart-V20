"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import {
  parseAbi,
  parseAbiItem,
  encodeAbiParameters,
  keccak256,
} from "viem";
import type { Address } from "viem";
import { getBillingHubAddress } from "@/lib/chain/billingHub";

// ── Typed ABI fragments — avoids the `Abi` cast / `unknown` return problem ─
// These are defined locally so this hook has no dependency on the generic
// `billingHubAbi` cast; `parseAbi` infers precise TypeScript return types.

const BILLING_HUB_READ_ABI = parseAbi([
  "function subscriptions(uint256 planId, address subscriber) view returns (uint64 startTime, uint64 nextChargeTime, uint32 cyclesCharged, uint32 cyclesAuthorized, bool active)",
  "function plans(uint256 planId) view returns (address merchant, address token, uint256 amountPerCycle, uint64 cycleLengthSeconds, uint32 maxCycles, bool active)",
]);

const TOKEN_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// `subscriber` is the second indexed topic on the Subscribed event —
// getLogs with args: { subscriber } filters by topic[2] = account.
const SUBSCRIBED_EVENT = parseAbiItem(
  "event Subscribed(uint256 indexed planId, address indexed subscriber, address indexed merchant, uint32 cyclesAuthorized, uint64 startTime)"
);

// ── Public types ───────────────────────────────────────────────────────────

/** All data needed to render a subscription card and execute cancel(). */
export type SubscriptionEntry = {
  readonly planId: bigint;
  /** keccak256(abi.encode(planId, subscriber)) — passed directly to cancel(). */
  readonly subscriptionId: `0x${string}`;
  readonly merchant: Address;
  readonly token: Address;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly amountPerCycle: bigint;
  readonly cycleLengthSeconds: bigint;
  readonly maxCycles: number;
  readonly cyclesCharged: number;
  readonly cyclesAuthorized: number;
  readonly nextChargeTime: bigint;
  readonly startTime: bigint;
};

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Reads all active subscriptions for the connected wallet from the
 * BillingHub contract.
 *
 * Algorithm:
 *   1. getLogs(Subscribed, args.subscriber = account) → unique planIds.
 *   2. batch readContract → subscriptions + plans for each planId.
 *   3. Filter: subscription.active === true (excludes exhausted/cancelled).
 *   4. Fetch token symbol + decimals for each unique token address.
 *   5. Assemble SubscriptionEntry[].
 *
 * Imperative async pattern (not declarative useReadContracts) because step 1
 * must complete before step 2's contract count is known.
 *
 * `refetch()` re-triggers the whole flow — call it after a successful cancel.
 */
export function useCustomerSubscriptions(): {
  readonly subscriptions: SubscriptionEntry[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
} {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hubAddress = getBillingHubAddress(chainId);

  const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this counter re-runs the fetch effect.
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConnected || !account || !hubAddress || !publicClient) {
      setSubscriptions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    void (async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // ── 1. Fetch Subscribed events for this subscriber ─────────────────
        // fromBlock: 0n is appropriate for Amoy testnet. For mainnet, scope
        // this to the BillingHub deployment block for faster RPC response.
        const logs = await publicClient.getLogs({
          address: hubAddress,
          event: SUBSCRIBED_EVENT,
          args: { subscriber: account },
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (cancelled) return;

        // ── 2. Deduplicate planIds ─────────────────────────────────────────
        // A subscriber may have re-subscribed after expiry — the on-chain
        // `subscriptions` mapping holds the current state, so one readContract
        // call per planId is sufficient regardless of duplicate log entries.
        const seen = new Set<bigint>();
        const planIds: bigint[] = [];
        for (const log of logs) {
          const id = log.args.planId;
          if (id !== undefined && !seen.has(id)) {
            seen.add(id);
            planIds.push(id);
          }
        }

        if (planIds.length === 0) {
          if (!cancelled) {
            setSubscriptions([]);
            setIsLoading(false);
          }
          return;
        }

        // ── 3. Batch-read subscription state + plan data ───────────────────
        const rawEntries = await Promise.all(
          planIds.map(async (planId) => {
            const [sub, plan] = await Promise.all([
              publicClient.readContract({
                address: hubAddress,
                abi: BILLING_HUB_READ_ABI,
                functionName: "subscriptions",
                args: [planId, account],
              }),
              publicClient.readContract({
                address: hubAddress,
                abi: BILLING_HUB_READ_ABI,
                functionName: "plans",
                args: [planId],
              }),
            ]);
            return { planId, sub, plan };
          })
        );

        if (cancelled) return;

        // ── 4. Filter to active subscriptions only ─────────────────────────
        // viem types parseAbi multi-output returns as readonly tuples:
        //   sub: readonly [startTime, nextChargeTime, cyclesCharged, cyclesAuthorized, active]
        //   plan: readonly [merchant, token, amountPerCycle, cycleLengthSeconds, maxCycles, active]
        const active = rawEntries.filter((e) => e.sub[4] === true);

        // ── 5. Fetch token metadata for each unique token ──────────────────
        const uniqueTokens = [
          ...new Set(active.map((e) => (e.plan[1] as string).toLowerCase())),
        ];

        const tokenMetaMap = new Map<
          string,
          { symbol: string; decimals: number }
        >();

        await Promise.all(
          uniqueTokens.map(async (tokenAddr) => {
            try {
              const [dec, sym] = await Promise.all([
                publicClient.readContract({
                  address: tokenAddr as Address,
                  abi: TOKEN_ABI,
                  functionName: "decimals",
                }),
                publicClient.readContract({
                  address: tokenAddr as Address,
                  abi: TOKEN_ABI,
                  functionName: "symbol",
                }),
              ]);
              tokenMetaMap.set(tokenAddr, {
                decimals: dec,
                symbol: sym,
              });
            } catch {
              // Graceful fallback: assume 6 decimals, show address prefix.
              tokenMetaMap.set(tokenAddr, {
                decimals: 6,
                symbol: `${tokenAddr.slice(0, 6)}…`,
              });
            }
          })
        );

        if (cancelled) return;

        // ── 6. Assemble final SubscriptionEntry list ───────────────────────
        // Destructure tuples by index (viem parseAbi multi-output = readonly tuple).
        // plan: [merchant, token, amountPerCycle, cycleLengthSeconds, maxCycles, active]
        // sub:  [startTime, nextChargeTime, cyclesCharged, cyclesAuthorized, active]
        const result: SubscriptionEntry[] = active.map(
          ({ planId, sub, plan }) => {
            const [merchant, token, amountPerCycle, cycleLengthSeconds, maxCycles] =
              plan as unknown as [Address, Address, bigint, bigint, number, boolean];
            const [startTime, nextChargeTime, cyclesCharged, cyclesAuthorized] =
              sub as unknown as [bigint, bigint, number, number, boolean];

            const tokenLower = token.toLowerCase();
            const meta = tokenMetaMap.get(tokenLower) ?? {
              decimals: 6,
              symbol: "?",
            };

            // Matches BillingHub._subscriptionId: keccak256(abi.encode(planId, subscriber)).
            const subscriptionId = keccak256(
              encodeAbiParameters(
                [{ type: "uint256" }, { type: "address" }],
                [planId, account]
              )
            );

            return {
              planId,
              subscriptionId,
              merchant,
              token,
              tokenSymbol: meta.symbol,
              tokenDecimals: meta.decimals,
              amountPerCycle,
              cycleLengthSeconds,
              maxCycles,
              cyclesCharged,
              cyclesAuthorized,
              nextChargeTime,
              startTime,
            };
          }
        );

        setSubscriptions(result);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load subscriptions."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, isConnected, hubAddress, publicClient, fetchTick]);

  return { subscriptions, isLoading, error, refetch };
}
