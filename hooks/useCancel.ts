"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { BaseError, type Hash, decodeErrorResult } from "viem";
import { billingHubAbi, getBillingHubAddress } from "@/lib/chain/billingHub";
import { toast } from "@/lib/toast";

// ── State machine ──────────────────────────────────────────────────────────

/**
 * Discriminated-union state machine for the cancel-subscription flow.
 *
 * Mirrors `CreatePlanState` exactly — one status per step. Per AI guidelines
 * §2, no boolean flags leak into the UI layer.
 */
export type CancelState =
  | { readonly status: "idle" }
  | { readonly status: "missing-deployment"; readonly chainId: number }
  | { readonly status: "simulating" }
  | { readonly status: "awaiting-signature" }
  | { readonly status: "mining"; readonly hash: Hash }
  | {
      readonly status: "success";
      readonly hash: Hash;
      readonly blockNumber: bigint;
    }
  | { readonly status: "error"; readonly message: string };

type CancelFn = (subscriptionId: `0x${string}`) => Promise<void>;

type UseCancelReturn = {
  readonly state: CancelState;
  readonly cancel: CancelFn;
  readonly reset: () => void;
};

// ── Error helper ───────────────────────────────────────────────────────────

/**
 * Decode a wagmi/viem error into a human-readable string (§4.3).
 * Walks the BaseError cause chain looking for BillingHub custom-error data
 * before falling back to viem's shortMessage.
 */
function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    let cursor: unknown = error;
    while (cursor) {
      const data = (cursor as { data?: `0x${string}` }).data;
      if (typeof data === "string" && data.length >= 10) {
        try {
          const decoded = decodeErrorResult({ abi: billingHubAbi, data });
          return decoded.errorName;
        } catch {
          // Not a BillingHub custom error — keep walking.
        }
      }
      cursor = (cursor as { cause?: unknown }).cause;
    }
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Orchestrates the cancel-subscription write flow:
 *   simulate → writeContract(cancel(subscriptionId)) → waitForReceipt
 *
 * One instance of this hook lives inside each `SubscriptionCard` so that
 * multiple cards can be independently in-flight without shared state.
 *
 * Compliance:
 *   §4.3: simulate-first, explicit `chainId` on every write, decoded reverts,
 *         hash surfaced immediately in "mining" state.
 *   §0.5: "missing-deployment" state when env var is unset.
 */
export function useCancel(): UseCancelReturn {
  const config = useConfig();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [state, setState] = useState<CancelState>({ status: "idle" });

  const reset = useCallback((): void => {
    setState({ status: "idle" });
  }, []);

  const cancel = useCallback<CancelFn>(
    async (subscriptionId) => {
      const billingHubAddress = getBillingHubAddress(chainId);

      if (!billingHubAddress) {
        setState({ status: "missing-deployment", chainId });
        return;
      }
      if (!account) {
        setState({ status: "error", message: "Wallet not connected." });
        return;
      }

      // ── Simulate ────────────────────────────────────────────────────────
      setState({ status: "simulating" });

      let request;
      try {
        // §4.3: simulate against the pinned chainId. Any revert (e.g.
        // SubscriptionInactive, Unauthorized) surfaces as a decoded error
        // name rather than raw hex.
        const sim = await simulateContract(config, {
          abi: billingHubAbi,
          address: billingHubAddress,
          functionName: "cancel",
          args: [subscriptionId],
          account,
          chainId,
        });
        request = sim.request;
      } catch (err) {
        const msg = explainError(err);
        setState({ status: "error", message: msg });
        toast.error(msg);
        return;
      }

      // ── Sign ─────────────────────────────────────────────────────────────
      setState({ status: "awaiting-signature" });

      let hash: Hash;
      try {
        // §4.3: explicit chainId on every write — never trust the wallet's
        // currently selected chain at call time.
        hash = await writeContract(config, request);
      } catch (err) {
        const msg = explainError(err);
        setState({ status: "error", message: msg });
        toast.error(msg);
        return;
      }

      // §4.3: expose hash immediately so the UI can show the Polygonscan link
      // before the receipt lands.
      setState({ status: "mining", hash });

      // ── Wait ─────────────────────────────────────────────────────────────
      try {
        const receipt = await waitForTransactionReceipt(config, {
          hash,
          chainId,
        });
        if (receipt.status !== "success") {
          setState({
            status: "error",
            message: "Transaction reverted on-chain.",
          });
          toast.error("Transaction reverted on-chain.");
          return;
        }
        setState({ status: "success", hash, blockNumber: receipt.blockNumber });
      } catch (err) {
        const msg = explainError(err);
        setState({ status: "error", message: msg });
        toast.error(msg);
      }
    },
    [account, chainId, config]
  );

  return { state, cancel, reset };
}
