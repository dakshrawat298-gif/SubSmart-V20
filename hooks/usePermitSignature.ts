"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { getAddress, type Address, type Hex } from "viem";
import { erc20PermitAbi, getTokenByAddress } from "@/lib/chain/contracts";
import {
  buildPermitTypedData,
  computeBoundedAuthorization,
  splitPermitSignature,
  type BoundedAuthorization,
  type PermitDomain,
  type PermitMessage,
} from "@/lib/chain/permit";
import { toast } from "@/lib/toast";

/**
 * Inputs for the permit signature hook. Pass `null` to keep the hook idle.
 *
 * All amounts are bounded per AI guidelines §4.1:
 * total = amountPerCycle * maxCycles
 * deadline = end-of-cycles + grace buffer.
 * Any inputs outside the {@link computeBoundedAuthorization} safe ranges
 * are surfaced as a typed `input_validation` error.
 */
export type UsePermitSignatureInput = {
  readonly token: Address;
  readonly spender: Address;
  readonly amountPerCycle: bigint;
  readonly maxCycles: number;
  readonly cycleLengthSeconds: number;
  readonly graceBufferSeconds?: number;
  readonly startTimeSeconds?: number;
};

/**
 * Human-readable summary the UI MUST render before invoking the wallet
 * (per §4.2). The hook does not call `signTypedData` on its own — the UI is
 * required to display this and gate signing on an explicit user action.
 */
export type PermitSummary = {
  readonly tokenSymbol: string;
  readonly tokenAddress: Address;
  readonly spender: Address;
  readonly amountPerCycle: bigint;
  readonly maxCycles: number;
  readonly cycleLengthSeconds: number;
  readonly totalAuthorized: bigint;
  readonly deadlineUnixSeconds: number;
  readonly chainId: number;
  readonly decimals: number;
};

/** Typed error union for the permit flow. No raw error strings escape. */
export type PermitError =
  | { readonly kind: "wallet_not_connected" }
  | {
      readonly kind: "wrong_chain";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly kind: "token_not_allowlisted";
      readonly token: Address;
      readonly chainId: number;
    }
  | { readonly kind: "token_does_not_support_permit"; readonly token: Address }
  | { readonly kind: "input_validation"; readonly message: string }
  | { readonly kind: "rpc_error"; readonly message: string }
  | { readonly kind: "user_rejected" }
  | { readonly kind: "unknown"; readonly message: string };

/** Discriminated state union for the permit signing flow. */
export type PermitState =
  | { readonly status: "idle" }
  | { readonly status: "preparing" }
  | {
      readonly status: "ready";
      readonly summary: PermitSummary;
      readonly typedData: ReturnType<typeof buildPermitTypedData>;
      readonly nonce: bigint;
      readonly authorization: BoundedAuthorization;
    }
  | { readonly status: "signing" }
  | {
      readonly status: "signed";
      readonly summary: PermitSummary;
      readonly authorization: BoundedAuthorization;
      readonly signature: Hex;
      readonly v: number;
      readonly r: Hex;
      readonly s: Hex;
    }
  | { readonly status: "error"; readonly error: PermitError };

/**
 * Prepare and (on explicit user action) request a *bounded* EIP-2612 permit
 * signature from the connected wallet.
 *
 * Security contract — must be honored by callers:
 * - The hook surfaces `summary` BEFORE signing. The UI MUST render that
 * summary so the user sees token, spender, amount, deadline, and the
 * derived periodic schedule (§4.2).
 * - `sign()` MUST be invoked from a user gesture (button click / tap).
 * Never on mount, never on a timer (§4.2).
 * - The hook hard-blocks any token that fails the runtime
 * `DOMAIN_SEPARATOR()` / `nonces(owner)` probe (§4.5), and any token
 * not on the static allow-list.
 * - Authorized `value` is `amountPerCycle * maxCycles`. There is no path
 * in this hook that produces `MaxUint256` or any unbounded value (§4.1).
 */
export function usePermitSignature(input: UsePermitSignatureInput | null): {
  readonly state: PermitState;
  readonly sign: () => Promise<void>;
  readonly reset: () => void;
} {
  const { address: owner } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [state, setState] = useState<PermitState>({ status: "idle" });

  const reset = useCallback((): void => {
    setState({ status: "idle" });
  }, []);

  // Preparation effect: validate inputs, probe the token, build typed data.
  // This is read-only (RPC reads only) and safe to run automatically. It
  // does NOT request a signature — that is gated behind sign().
  useEffect(() => {
    if (!input) {
      setState({ status: "idle" });
      return;
    }
    if (!owner) {
      setState({ status: "error", error: { kind: "wallet_not_connected" } });
      return;
    }
    if (!publicClient) {
      setState({
        status: "error",
        error: { kind: "rpc_error", message: "No RPC client available" },
      });
      return;
    }

    let cancelled = false;
    setState({ status: "preparing" });

    void (async (): Promise<void> => {
      try {
        // §4.5: token must be on the static allow-list.
        const tokenInfo = getTokenByAddress(chainId, input.token);
        if (!tokenInfo) {
          if (!cancelled) {
            setState({
              status: "error",
              error: {
                kind: "token_not_allowlisted",
                token: input.token,
                chainId,
              },
            });
          }
          return;
        }
        if (!tokenInfo.supportsPermit) {
          if (!cancelled) {
            setState({
              status: "error",
              error: {
                kind: "token_does_not_support_permit",
                token: tokenInfo.address,
              },
            });
          }
          return;
        }

        // §4.1: bounded authorization. Throws on any unsafe input; rethrown
        // below as a typed input_validation error.
        const authorization = computeBoundedAuthorization({
          amountPerCycle: input.amountPerCycle,
          maxCycles: input.maxCycles,
          cycleLengthSeconds: input.cycleLengthSeconds,
          graceBufferSeconds: input.graceBufferSeconds,
          startTimeSeconds: input.startTimeSeconds,
        });

        // §4.5 runtime probe + EIP-712 domain inputs.
        // External RPC reads (no signing): nonces, DOMAIN_SEPARATOR, name,
        // version. `version()` is optional on many tokens — tolerated.
        const versionPromise: Promise<string | undefined> = publicClient
          .readContract({
            address: tokenInfo.address,
            abi: erc20PermitAbi,
            functionName: "version",
          })
          .catch(() => undefined);

        const [nonce, _domainSeparator, name, versionFromContract] =
          await Promise.all([
            publicClient.readContract({
              address: tokenInfo.address,
              abi: erc20PermitAbi,
              functionName: "nonces",
              args: [getAddress(owner)],
            }),
            publicClient.readContract({
              address: tokenInfo.address,
              abi: erc20PermitAbi,
              functionName: "DOMAIN_SEPARATOR",
            }),
            publicClient.readContract({
              address: tokenInfo.address,
              abi: erc20PermitAbi,
              functionName: "name",
            }),
            versionPromise,
          ]);

        const domain: PermitDomain = {
          name,
          version: versionFromContract ?? tokenInfo.permitVersion ?? "1",
          chainId,
          verifyingContract: tokenInfo.address,
        };

        const message: PermitMessage = {
          owner: getAddress(owner),
          spender: getAddress(input.spender),
          value: authorization.value,
          nonce,
          deadline: authorization.deadline,
        };

        const typedData = buildPermitTypedData({ domain, message });

        const summary: PermitSummary = {
          tokenSymbol: tokenInfo.symbol,
          tokenAddress: tokenInfo.address,
          spender: getAddress(input.spender),
          amountPerCycle: authorization.amountPerCycle,
          maxCycles: authorization.maxCycles,
          cycleLengthSeconds: authorization.cycleLengthSeconds,
          totalAuthorized: authorization.value,
          deadlineUnixSeconds: authorization.endTimeSeconds,
          chainId,
          decimals: tokenInfo.decimals,
        };

        if (!cancelled) {
          setState({
            status: "ready",
            summary,
            typedData,
            nonce,
            authorization,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const looksLikeInputError =
          /must be|exceeds|positive|invalid|non-negative/i.test(message);
        setState({
          status: "error",
          error: looksLikeInputError
            ? { kind: "input_validation", message }
            : { kind: "rpc_error", message },
        });
        toast.error(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    input?.token,
    input?.spender,
    input?.amountPerCycle,
    input?.maxCycles,
    input?.cycleLengthSeconds,
    input?.graceBufferSeconds,
    input?.startTimeSeconds,
    owner,
    chainId,
    publicClient,
  ]);

  /**
   * Request the EIP-712 signature from the connected wallet. MUST be called
   * from a user-gesture handler (§4.2). Idempotent: ignored unless the state
   * is `ready`.
   */
  const sign = useCallback(async (): Promise<void> => {
    if (state.status !== "ready") return;
    if (!walletClient) {
      setState({
        status: "error",
        error: { kind: "rpc_error", message: "No wallet client available" },
      });
      return;
    }

    // §4.2: hard-reject when the wallet's chainId does not match the
    // typed-data domain's chainId. A signature produced under the wrong
    // chainId is invalid and could be replayed misleadingly.
    const walletChainId = walletClient.chain?.id;
    if (
      walletChainId === undefined ||
      walletChainId !== state.typedData.domain.chainId
    ) {
      setState({
        status: "error",
        error: {
          kind: "wrong_chain",
          expected: state.typedData.domain.chainId,
          actual: walletChainId ?? -1,
        },
      });
      return;
    }

    setState({ status: "signing" });

    try {
      // External interaction: signTypedData. Complies with §4.2 (EIP-712
      // typed data with explicit nonce + deadline; no personal_sign).
      const signature: Hex = await walletClient.signTypedData({
        account: state.typedData.message.owner,
        domain: state.typedData.domain,
        types: state.typedData.types,
        primaryType: state.typedData.primaryType,
        message: state.typedData.message,
      });
      const { v, r, s } = splitPermitSignature(signature);
      setState({
        status: "signed",
        summary: state.summary,
        authorization: state.authorization,
        signature,
        v,
        r,
        s,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isReject =
        /reject|denied|user (rejected|denied)/i.test(message) ||
        (typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: number }).code === 4001);
      setState({
        status: "error",
        error: isReject
          ? { kind: "user_rejected" }
          : { kind: "unknown", message },
      });
      toast.error(isReject ? "Signature rejected by user" : message);
    }
  }, [state, walletClient]);

  return { state, sign, reset };
}
