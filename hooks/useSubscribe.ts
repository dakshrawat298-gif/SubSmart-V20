"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
} from "@wagmi/core";
import {
  BaseError,
  isAddress,
  encodeFunctionData,
  type Address,
  type Hash,
  decodeErrorResult,
} from "viem";
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
      // ── Hard guards: refuse to even simulate unless every required value is
      // fully populated and well-formed. This is the last line of defense
      // before a `subscribe` tx reaches the wallet — any failure here aborts
      // with an explicit error state instead of broadcasting empty calldata.
      if (txChainId === undefined) {
        setTxState({
          status: "error",
          message: "No active chain detected — connect a wallet first.",
        });
        return;
      }
      if (!isAddress(hubAddress)) {
        setTxState({
          status: "error",
          message: "BillingHub address is invalid for the active chain.",
        });
        return;
      }
      if (!isAddress(txAccount)) {
        setTxState({
          status: "error",
          message: "Wallet address is invalid — reconnect your wallet.",
        });
        return;
      }
      if (planId < 0n) {
        setTxState({
          status: "error",
          message: "Invalid plan ID.",
        });
        return;
      }
      if (
        !Number.isInteger(authorization.maxCycles) ||
        authorization.maxCycles < 1 ||
        authorization.maxCycles > 4_294_967_295
      ) {
        setTxState({
          status: "error",
          message:
            "Permit authorized an invalid cycle count — re-sign to retry.",
        });
        return;
      }
      // EIP-2612 permit deadline must still be in the future at broadcast time.
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      if (authorization.deadline <= nowSeconds) {
        setTxState({
          status: "error",
          message: "Permit deadline has expired — re-sign to retry.",
        });
        return;
      }
      // EIP-2612 v/r/s shape checks — `v` is uint8, r/s are bytes32 (0x + 64 hex).
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        setTxState({
          status: "error",
          message: "Permit signature is malformed (v) — re-sign to retry.",
        });
        return;
      }
      if (typeof r !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(r)) {
        setTxState({
          status: "error",
          message: "Permit signature is malformed (r) — re-sign to retry.",
        });
        return;
      }
      if (typeof s !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(s)) {
        setTxState({
          status: "error",
          message: "Permit signature is malformed (s) — re-sign to retry.",
        });
        return;
      }

      // ── Pre-simulate calldata defense: explicitly encode what the tx
      // calldata WILL be, against the BillingHub ABI. If the ABI is missing
      // `subscribe` or the args don't match the function signature, this
      // throws synchronously — preventing any subsequent broadcast of empty
      // or wrong-selector calldata. (Checking `request.data` post-simulate
      // doesn't work because viem encodes calldata inside `writeContract`,
      // not inside `simulateContract` — `request` carries abi+functionName
      // +args and the encoding happens later.)
      let encodedCalldata: `0x${string}`;
      try {
        encodedCalldata = encodeFunctionData({
          abi: billingHubAbi,
          functionName: "subscribe",
          args: [
            planId,
            authorization.maxCycles,
            authorization.deadline,
            v,
            r,
            s,
          ],
        });
      } catch (err) {
        // Always surface encoding errors — never guard with `cancelled`.
        // React 18 setState on a dismounted component is a safe no-op.
        setTxState({
          status: "error",
          message: `Failed to encode subscribe calldata: ${explainError(err)}`,
        });
        return;
      }
      if (
        !encodedCalldata ||
        encodedCalldata === "0x" ||
        encodedCalldata.length < 10
      ) {
        setTxState({
          status: "error",
          message:
            "Aborted: encoded calldata is empty. ABI may be out of sync with the contract.",
        });
        return;
      }

      // Only skip progress updates (not errors) when cancelled, to avoid
      // bouncing a dismounted component through unnecessary state transitions.
      if (cancelled) return;
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
        // CRITICAL: do NOT guard with `if (!cancelled)` here. In React
        // StrictMode, the cleanup sets cancelled=true before this catch
        // runs, silently eating the error and leaving the spinner stuck
        // forever. Errors must always reach the UI state machine.
        setTxState({ status: "error", message: explainError(err) });
        return;
      }

      if (cancelled) return;

      // Post-simulate sanity check on the resolved target address. Wagmi's
      // `request` carries `address` (an input field), so this check IS
      // reliable — unlike `data`, which is encoded inside `writeContract`.
      const requestAddress = (request as { address?: Address }).address;
      if (
        !requestAddress ||
        requestAddress.toLowerCase() !== hubAddress.toLowerCase()
      ) {
        setTxState({
          status: "error",
          message:
            "Aborted: simulator returned a request for the wrong contract address.",
        });
        return;
      }

      setTxState({ status: "awaiting-tx-signature" });

      let hash: Hash;
      try {
        // §4.3: explicit chainId on every write — never trust wallet's current chain.
        hash = await writeContract(config, request);
      } catch (err) {
        // Same reasoning: always surface wallet/write errors regardless of
        // cancelled state — the user needs to see what went wrong.
        setTxState({ status: "error", message: explainError(err) });
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
        // Always surface receipt-wait errors too.
        setTxState({ status: "error", message: explainError(err) });
      }
    })();

    return () => {
      cancelled = true;
      // Reset the guard so React StrictMode's second effect invocation
      // can re-enter the async flow cleanly. Without this, StrictMode's
      // cleanup+remount cycle would permanently block the tx from starting.
      txStartedRef.current = false;
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
