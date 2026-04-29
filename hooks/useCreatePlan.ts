"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
} from "@wagmi/core";
import {
  BaseError,
  isAddress,
  type Address,
  type Hash,
  decodeErrorResult,
  parseEventLogs,
} from "viem";
import { billingHubAbi, getBillingHubAddress } from "@/lib/chain/billingHub";

/**
 * Inputs for `useCreatePlan` — pre-validated by the caller so this hook only
 * deals in canonical types. Widths match the BillingHub.createPlan signature.
 */
export type CreatePlanInput = {
  readonly token: Address;
  readonly amountPerCycle: bigint;
  readonly cycleLengthSeconds: bigint;
  readonly maxCycles: number;
};

/**
 * Discriminated-union state machine for the create-plan flow. Per AI
 * guidelines §2 the UI uses this directly — no looser flags like
 * `isLoading: boolean | undefined`.
 */
export type CreatePlanState =
  | { readonly status: "idle" }
  | { readonly status: "missing-deployment"; readonly chainId: number }
  | { readonly status: "simulating" }
  | { readonly status: "awaiting-signature" }
  | { readonly status: "mining"; readonly hash: Hash }
  | {
      readonly status: "success";
      readonly hash: Hash;
      readonly blockNumber: bigint;
      /**
       * The on-chain plan id assigned by `BillingHub`, decoded from the
       * `PlanCreated` event in the transaction receipt. `undefined` only if
       * the event was somehow missing from the receipt (defensive guard —
       * should never happen for a successful `createPlan` tx).
       */
      readonly planId: bigint | undefined;
    }
  | { readonly status: "error"; readonly message: string };

type SubmitFn = (input: CreatePlanInput) => Promise<void>;

type UseCreatePlanReturn = {
  readonly state: CreatePlanState;
  readonly submit: SubmitFn;
  readonly reset: () => void;
};

/**
 * Decode a wagmi/viem error into a human-readable string. Per §4.3, callers
 * MUST surface decoded revert reasons — never raw hex.
 *
 * Tries (in order):
 *   1. `decodeErrorResult` against the BillingHub ABI for custom-error reverts
 *      (so a `PlanNotFound()` revert renders as "PlanNotFound" not "0x...").
 *   2. `BaseError.shortMessage` — viem's parsed top-line.
 *   3. `error.message` as a fallback string.
 */
function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    // Walk the cause chain looking for raw revert data we can decode against
    // the BillingHub ABI. viem nests this under various error subclasses.
    let cursor: unknown = error;
    while (cursor) {
      const data = (cursor as { data?: `0x${string}` }).data;
      if (typeof data === "string" && data.length >= 10) {
        try {
          const decoded = decodeErrorResult({
            abi: billingHubAbi,
            data,
          });
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
 * Orchestrates the create-plan write: simulate → write → wait. Returns a
 * discriminated state machine the UI renders directly. Compliance notes:
 *
 *  - §4.3: simulate-first via `simulateContract`, explicit `chainId` on
 *    every write, decoded revert reasons surfaced verbatim, tx hash exposed
 *    immediately after submission so the UI can render a Polygonscan link
 *    before confirmation lands.
 *  - §0.5: when no `BillingHub` is deployed for the active chain (env var
 *    unset), the state immediately becomes `missing-deployment` instead of
 *    silently failing.
 *  - §3.2: client-only — wallet hooks require browser context.
 *
 * Imperative `@wagmi/core` actions are used (not `useSimulateContract`)
 * because the flow is click-to-submit; the declarative simulator would race
 * on stale args between `setState` and `refetch`.
 */
export function useCreatePlan(): UseCreatePlanReturn {
  const config = useConfig();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [state, setState] = useState<CreatePlanState>({ status: "idle" });

  const reset = useCallback((): void => {
    setState({ status: "idle" });
  }, []);

  const submit = useCallback<SubmitFn>(
    async (input) => {
      // ── Hard guards: refuse to even simulate unless every input is fully
      // populated and well-formed. This is the last line of defense against
      // an empty-calldata `0x` tx ever leaving the dapp. Any failure here
      // sets an explicit error state instead of silently calling write.
      if (chainId === undefined) {
        setState({
          status: "error",
          message: "No active chain detected — connect a wallet first.",
        });
        return;
      }
      const billingHubAddress = getBillingHubAddress(chainId);
      if (!billingHubAddress) {
        setState({
          status: "missing-deployment",
          chainId,
        });
        return;
      }
      if (!account) {
        setState({ status: "error", message: "Wallet not connected." });
        return;
      }
      if (!isAddress(input.token)) {
        setState({
          status: "error",
          message: "Invalid token address — pick a token from the list.",
        });
        return;
      }
      if (input.amountPerCycle <= 0n) {
        setState({
          status: "error",
          message: "Amount per cycle must be greater than zero.",
        });
        return;
      }
      if (input.cycleLengthSeconds <= 0n) {
        setState({
          status: "error",
          message: "Cycle length must be greater than zero.",
        });
        return;
      }
      if (
        !Number.isInteger(input.maxCycles) ||
        input.maxCycles < 1 ||
        input.maxCycles > 4_294_967_295
      ) {
        setState({
          status: "error",
          message: "Max cycles must be an integer between 1 and 4294967295.",
        });
        return;
      }

      setState({ status: "simulating" });

      let request;
      try {
        // §4.3: simulate first, against the explicitly-pinned chainId. If
        // the call would revert on-chain, viem throws here with a decoded
        // reason that `explainError` will surface verbatim.
        const sim = await simulateContract(config, {
          abi: billingHubAbi,
          address: billingHubAddress,
          functionName: "createPlan",
          args: [
            input.token,
            input.amountPerCycle,
            input.cycleLengthSeconds,
            input.maxCycles,
          ],
          account,
          chainId,
        });
        request = sim.request;
      } catch (error) {
        setState({ status: "error", message: explainError(error) });
        return;
      }

      // Defensive sanity-check on the simulated request before we hand it to
      // the wallet. If `simulateContract` somehow returned a request without
      // encoded calldata, refuse to broadcast — this is the exact condition
      // that causes a `0x` empty-calldata transaction to land on-chain.
      const requestData = (request as { data?: `0x${string}` }).data;
      if (!requestData || requestData === "0x" || requestData.length < 10) {
        setState({
          status: "error",
          message:
            "Aborted: simulator returned empty calldata. No transaction was sent.",
        });
        return;
      }
      const requestAddress = (request as { address?: Address }).address;
      if (
        !requestAddress ||
        requestAddress.toLowerCase() !== billingHubAddress.toLowerCase()
      ) {
        setState({
          status: "error",
          message:
            "Aborted: simulator returned a request for the wrong contract address.",
        });
        return;
      }

      setState({ status: "awaiting-signature" });

      let hash: Hash;
      try {
        // §4.3: explicit chainId on every write — never trust the wallet's
        // currently selected chain at call time.
        hash = await writeContract(config, request);
      } catch (error) {
        setState({ status: "error", message: explainError(error) });
        return;
      }

      // §4.3: surface the tx hash IMMEDIATELY (before the receipt lands) so
      // the UI can render a Polygonscan link the user can click right away.
      setState({ status: "mining", hash });

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
          return;
        }

        // Decode the `PlanCreated` event from the receipt so the UI can
        // surface the new planId (used for the share/checkout link). Logs
        // already exist in the receipt — no extra RPC call required.
        let planId: bigint | undefined;
        try {
          const events = parseEventLogs({
            abi: billingHubAbi,
            eventName: "PlanCreated",
            logs: receipt.logs,
          });
          const first = events[0];
          if (first && "args" in first) {
            const args = first.args as { planId?: bigint };
            planId = args.planId;
          }
        } catch {
          // Best-effort decode — keep planId undefined if anything is off.
          planId = undefined;
        }

        setState({
          status: "success",
          hash,
          blockNumber: receipt.blockNumber,
          planId,
        });
      } catch (error) {
        setState({ status: "error", message: explainError(error) });
      }
    },
    [account, chainId, config]
  );

  return { state, submit, reset };
}
