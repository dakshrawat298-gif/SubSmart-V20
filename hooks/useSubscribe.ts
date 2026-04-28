"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { BaseError, type Address, type Hash, decodeErrorResult } from "viem";
import { billingHubAbi, getBillingHubAddress } from "@/lib/chain/billingHub";
import { usePermitSignature } from "@/hooks/usePermitSignature";
import type { PermitSummary } from "@/hooks/usePermitSignature";
import type { BoundedAuthorization } from "@/lib/chain/permit";

/**
 * On-chain plan data returned by `BillingHub.plans(planId)`.
 * Field names and types mirror the Solidity struct exactly.
 */
export type PlanData = {
  readonly merchant: Address;
  readonly token: Address;
  readonly amountPerCycle: bigint;
  readonly cycleLengthSeconds: bigint;
  readonly maxCycles: number;
  readonly active: boolean;
};

/** Input required to run the full subscribe flow. */
export type UseSubscribeInput = {
  readonly planId: bigint;
  readonly plan: PlanData;
};

/**
 * Discriminated-union state machine for the two-phase customer subscribe flow.
 *
 * Phase A (permit): preparing-permit → permit-ready → signing-permit
 * Phase B (tx):     simulating → awaiting-tx-signature → mining → success
 *
 * Per AI guidelines §2, the UI maps directly onto this union. No boolean soup.
 */
export type SubscribeState =
  | { readonly status: "idle" }
  | { readonly status: "missing-deployment"; readonly chainId: number }
  | { readonly status: "preparing-permit" }
  | {
      readonly status: "permit-ready";
      readonly summary: PermitSummary;
      readonly authorization: BoundedAuthorization;
    }
  | { readonly status: "signing-permit" }
  | { readonly status: "simulating" }
  | { readonly status: "awaiting-tx-signature" }
  | { readonly status: "mining"; readonly hash: Hash }
  | {
      readonly status: "success";
      readonly hash: Hash;
      readonly blockNumber: bigint;
    }
  | { readonly status: "error"; readonly message: string };

type TxPhaseState =
  | { readonly status: "idle" }
  | { readonly status: "simulating" }
  | { readonly status: "awaiting-tx-signature" }
  | { readonly status: "mining"; readonly hash: Hash }
  | {
      readonly status: "success";
      readonly hash: Hash;
      readonly blockNumber: bigint;
    }
  | { readonly status: "error"; readonly message: string };

type UseSubscribeReturn = {
  readonly state: SubscribeState;
  readonly sign: () => Promise<void>;
  readonly reset: () => void;
};

/**
 * Decode a wagmi/viem error into a human-readable string (§4.3).
 * Mirrors the same helper in useCreatePlan — decodes BillingHub custom errors
 * first (so `SubscriptionAlreadyActive()` renders as that, not raw hex).
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

/**
 * Map a PermitError union to a human-readable string for the combined
 * SubscribeState `"error"` branch.
 */
function explainPermitError(
  error: ReturnType<typeof usePermitSignature>["state"] & {
    status: "error";
  }
): string {
  const { kind } = error.error;
  switch (kind) {
    case "wallet_not_connected":
      return "Wallet not connected.";
    case "wrong_chain":
      return `Wrong network. Switch to chain ${error.error.expected} and try again.`;
    case "token_not_allowlisted":
      return "Subscription token is not on the protocol allow-list.";
    case "token_does_not_support_permit":
      return "Subscription token does not support EIP-2612 Permit — cannot subscribe.";
    case "input_validation":
      return error.error.message;
    case "rpc_error":
      return `RPC error: ${error.error.message}`;
    case "user_rejected":
      return "Signature rejected. Click \"Authorize & Subscribe\" to try again.";
    case "unknown":
      return error.error.message;
  }
}

/**
 * Orchestrates the full customer subscribe flow:
 *   1. Prepare + request a bounded EIP-2612 permit via `usePermitSignature`
 *      (§4.1: value = amountPerCycle × maxCycles, no MaxUint256 path).
 *   2. After the permit is signed, auto-trigger simulate → write for
 *      `BillingHub.subscribe(planId, cyclesAuthorized, deadline, v, r, s)`.
 *
 * Callers must:
 *  - Render `AllowanceDisclosure` from `state.summary` when
 *    `state.status === "permit-ready"` (§4.2 — human-readable pre-sign summary).
 *  - Invoke `sign()` only from a user-gesture handler, never on mount (§4.2).
 *  - Handle `state.status === "missing-deployment"` explicitly (§0.5).
 *
 * §4.3: simulateContract runs before writeContract; explicit `chainId` on
 * every write; decoded revert reasons surface verbatim.
 */
export function useSubscribe(
  input: UseSubscribeInput | null
): UseSubscribeReturn {
  const config = useConfig();
  const { address: account } = useAccount();
  const chainId = useChainId();

  const billingHubAddress = getBillingHubAddress(chainId);

  const permitInput =
    input && billingHubAddress
      ? {
          token: input.plan.token,
          spender: billingHubAddress,
          amountPerCycle: input.plan.amountPerCycle,
          maxCycles: input.plan.maxCycles,
          cycleLengthSeconds: Number(input.plan.cycleLengthSeconds),
        }
      : null;

  const permitHook = usePermitSignature(permitInput);

  const [txState, setTxState] = useState<TxPhaseState>({ status: "idle" });

  // Guards double-start: once the tx async function begins, this flips true.
  // Reset in `reset()` so the user can retry after an error.
  const txStartedRef = useRef(false);

  // Auto-trigger the subscribe transaction once the permit is signed. Uses the
  // full dep list + the txStartedRef guard so the effect is idempotent even if
  // deps change while the tx is in flight (§4.3).
  useEffect(() => {
    if (permitHook.state.status !== "signed") return;
    if (txStartedRef.current) return;
    if (!input || !account || !billingHubAddress) return;

    txStartedRef.current = true;

    const { v, r, s, authorization } = permitHook.state;
    const { planId } = input;
    const hubAddress = billingHubAddress;
    const txChainId = chainId;
    const txAccount = account;

    let cancelled = false;

    void (async (): Promise<void> => {
      setTxState({ status: "simulating" });

      let request;
      try {
        // §4.3: simulate first against the explicitly-pinned chainId. Reverts
        // surface as decoded error names rather than raw hex strings.
        const sim = await simulateContract(config, {
          abi: billingHubAbi,
          address: hubAddress,
          functionName: "subscribe",
          args: [
            planId,
            authorization.maxCycles,
            authorization.deadline,
            v,
            r,
            s,
          ],
          account: txAccount,
          chainId: txChainId,
        });
        request = sim.request;
      } catch (err) {
        if (!cancelled) {
          setTxState({ status: "error", message: explainError(err) });
        }
        return;
      }

      if (cancelled) return;
      setTxState({ status: "awaiting-tx-signature" });

      let hash: Hash;
      try {
        // §4.3: explicit chainId on every write — never trust wallet's current chain.
        hash = await writeContract(config, request);
      } catch (err) {
        if (!cancelled) {
          setTxState({ status: "error", message: explainError(err) });
        }
        return;
      }

      if (cancelled) return;
      // §4.3: surface hash IMMEDIATELY so the UI can show the Polygonscan link
      // before the receipt lands — users can click through while waiting.
      setTxState({ status: "mining", hash });

      try {
        const receipt = await waitForTransactionReceipt(config, {
          hash,
          chainId: txChainId,
        });
        if (cancelled) return;
        if (receipt.status !== "success") {
          setTxState({
            status: "error",
            message: "Transaction reverted on-chain.",
          });
          return;
        }
        setTxState({
          status: "success",
          hash,
          blockNumber: receipt.blockNumber,
        });
      } catch (err) {
        if (!cancelled) {
          setTxState({ status: "error", message: explainError(err) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    permitHook.state,
    input,
    account,
    billingHubAddress,
    chainId,
    config,
  ]);

  const reset = useCallback((): void => {
    permitHook.reset();
    setTxState({ status: "idle" });
    txStartedRef.current = false;
  }, [permitHook]);

  // Build the unified state from the two sub-state machines.
  // The tx phase takes precedence once it starts (status !== "idle").
  const state = ((): SubscribeState => {
    // Check for missing deployment first — takes priority over everything.
    if (!billingHubAddress && input) {
      return { status: "missing-deployment", chainId };
    }

    // Tx phase: once the async tx starts, only tx states are shown.
    if (txState.status !== "idle") {
      switch (txState.status) {
        case "simulating":
          return { status: "simulating" };
        case "awaiting-tx-signature":
          return { status: "awaiting-tx-signature" };
        case "mining":
          return { status: "mining", hash: txState.hash };
        case "success":
          return {
            status: "success",
            hash: txState.hash,
            blockNumber: txState.blockNumber,
          };
        case "error":
          return { status: "error", message: txState.message };
      }
    }

    // Permit phase.
    switch (permitHook.state.status) {
      case "idle":
        return { status: "idle" };
      case "preparing":
        return { status: "preparing-permit" };
      case "ready":
        return {
          status: "permit-ready",
          summary: permitHook.state.summary,
          authorization: permitHook.state.authorization,
        };
      case "signing":
        return { status: "signing-permit" };
      case "signed":
        // Tx effect has been triggered; show simulating while it starts.
        return { status: "simulating" };
      case "error":
        return {
          status: "error",
          message: explainPermitError(
            permitHook.state as typeof permitHook.state & { status: "error" }
          ),
        };
    }
  })();

  return { state, sign: permitHook.sign, reset };
}
