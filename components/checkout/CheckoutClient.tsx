"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { billingHubAbi, getBillingHubAddress } from "@/lib/chain/billingHub";
import { useSubscribe, type PlanData } from "@/hooks/useSubscribe";
import { ConnectButton } from "@/components/web3/ConnectButton";
import { PlanSummaryCard } from "@/components/checkout/PlanSummaryCard";
import { AllowanceDisclosure } from "@/components/checkout/AllowanceDisclosure";
import { CheckoutStatus } from "@/components/checkout/CheckoutStatus";

type Props = {
  /** Raw `planId` string from the URL segment — validated + parsed here. */
  readonly planIdParam: string;
};

/**
 * Interactive checkout flow for the customer subscription page.
 *
 * Responsibility: orchestrate plan fetching, wallet state, and the two-phase
 * subscribe flow (permit sign → subscribe tx). Delegate every distinct concern
 * to a focused sub-component (per §3.1: ≤150 lines, single responsibility).
 *
 * Per §3.2: this is the client boundary. The parent `page.tsx` is a server
 * component; this component handles all wallet-dependent logic.
 *
 * State handled here:
 *  - Invalid planId (non-numeric URL param)
 *  - Wallet not connected (prompt)
 *  - Plan not found / inactive (RPC read result)
 *  - Already subscribed (guard)
 *  - Full subscribe flow via useSubscribe
 */
export function CheckoutClient({ planIdParam }: Props): JSX.Element {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const billingHubAddress = getBillingHubAddress(chainId);

  // Parse and validate the URL planId — it must be a non-negative integer.
  const planId = useMemo((): bigint | null => {
    try {
      const n = BigInt(planIdParam.trim());
      return n >= 0n ? n : null;
    } catch {
      return null;
    }
  }, [planIdParam]);

  // Read plan data from chain. Skipped when planId is invalid or hub is undeployed.
  const {
    data: planRaw,
    isLoading: planLoading,
    error: planError,
  } = useReadContract({
    abi: billingHubAbi,
    address: billingHubAddress,
    functionName: "plans",
    args: planId !== null ? [planId] : undefined,
    query: { enabled: planId !== null && billingHubAddress !== undefined },
  });

  // Check active subscription to avoid duplicate subscriptions.
  const { data: isAlreadySubscribed } = useReadContract({
    abi: billingHubAbi,
    address: billingHubAddress,
    functionName: "isSubscribed",
    args:
      planId !== null && account ? [planId, account] : undefined,
    query: {
      enabled:
        planId !== null &&
        billingHubAddress !== undefined &&
        isConnected &&
        account !== undefined,
    },
  });

  // Normalise the tuple-style wagmi return into our PlanData type.
  const plan: PlanData | null = useMemo(() => {
    if (!planRaw) return null;
    const [merchant, token, amountPerCycle, cycleLengthSeconds, maxCycles, active] =
      planRaw as [
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        number,
        boolean,
      ];
    return { merchant, token, amountPerCycle, cycleLengthSeconds, maxCycles, active };
  }, [planRaw]);

  const subscribeInput =
    planId !== null && plan !== null && plan.active
      ? { planId, plan }
      : null;

  const { state, sign, reset } = useSubscribe(subscribeInput);

  const isBusy =
    state.status === "preparing-permit" ||
    state.status === "signing-permit" ||
    state.status === "simulating" ||
    state.status === "awaiting-tx-signature" ||
    state.status === "mining";

  const isSuccess = state.status === "success";

  // ── Error cases ────────────────────────────────────────────────────────────

  if (planId === null) {
    return (
      <InfoPanel tone="error" title="Invalid plan ID">
        The URL contains an invalid plan identifier. Check the link you
        received from the merchant.
      </InfoPanel>
    );
  }

  if (!billingHubAddress) {
    return (
      <InfoPanel tone="warn" title="Protocol not deployed on this chain">
        SubSmart is not yet deployed on this network. Switch to Polygon Mainnet
        or Polygon Amoy (testnet) to subscribe.
      </InfoPanel>
    );
  }

  if (planLoading) {
    return (
      <InfoPanel tone="info" title="Loading plan…" spinner />
    );
  }

  if (planError || !plan) {
    return (
      <InfoPanel tone="error" title="Plan not found">
        No plan exists for ID {planId.toString()} on this chain. Verify the
        subscription link with the merchant.
      </InfoPanel>
    );
  }

  if (!plan.active) {
    return (
      <InfoPanel tone="warn" title="Plan is inactive">
        This billing plan has been paused or archived by the merchant and is no
        longer accepting new subscriptions.
      </InfoPanel>
    );
  }

  // ── Happy-path rendering ───────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PlanSummaryCard planId={planId} plan={plan} chainId={chainId} />

      {!isConnected && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center sm:p-8">
          <WalletIcon />
          <h2 className="mt-4 text-base font-semibold text-white sm:text-lg">
            Connect your wallet to subscribe
          </h2>
          <p className="mt-2 text-sm text-white/60">
            You will sign one gas-free EIP-712 permit — the only action needed
            for the lifetime of your subscription.
          </p>
          <div className="mt-5 flex justify-center">
            <ConnectButton />
          </div>
        </div>
      )}

      {isConnected && isAlreadySubscribed === true && !isSuccess && (
        <InfoPanel tone="success" title="Already subscribed">
          Your wallet is already an active subscriber on this plan. No further
          action is needed — charges run automatically each cycle.
        </InfoPanel>
      )}

      {isConnected && !isAlreadySubscribed && !isSuccess && (
        <>
          {state.status === "permit-ready" && (
            <AllowanceDisclosure
              summary={state.summary}
              authorization={state.authorization}
            />
          )}

          {!isBusy && state.status !== "error" && (
            <button
              type="button"
              onClick={sign}
              disabled={state.status !== "permit-ready"}
              className="group relative inline-flex min-h-[60px] w-full items-center justify-center overflow-hidden rounded-2xl px-5 text-base font-semibold tracking-wide text-white shadow-[0_14px_44px_-12px_rgba(99,102,241,0.75)] transition hover:shadow-[0_18px_52px_-10px_rgba(232,121,249,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 opacity-0 transition group-hover:opacity-100" />
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <span className="relative flex items-center gap-2.5">
                <LockIcon />
                {state.status === "permit-ready"
                  ? "Subscribe Now"
                  : "Preparing…"}
              </span>
            </button>
          )}

          {state.status === "permit-ready" && (
            <p className="mt-3 text-center text-[11px] text-white/45 sm:text-xs">
              You'll sign one gas-free EIP-712 permit · No infinite approvals · Cancel any time
            </p>
          )}
        </>
      )}

      <CheckoutStatus state={state} onReset={reset} />
    </div>
  );
}

const TONE_STYLES = {
  info: "border-indigo-300/20 bg-indigo-500/[0.07] text-indigo-100",
  success: "border-emerald-300/25 bg-emerald-500/[0.07] text-emerald-100",
  warn: "border-amber-300/25 bg-amber-500/[0.07] text-amber-100",
  error: "border-rose-300/25 bg-rose-500/[0.07] text-rose-100",
} as const;

function InfoPanel({
  tone,
  title,
  children,
  spinner = false,
}: {
  tone: keyof typeof TONE_STYLES;
  title: string;
  children?: React.ReactNode;
  spinner?: boolean;
}): JSX.Element {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`rounded-2xl border p-5 text-sm ${TONE_STYLES[tone]}`}
    >
      <div className="flex items-center gap-2">
        {spinner && (
          <svg
            className="h-4 w-4 animate-spin text-white/80"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <path
              d="M21 12a9 9 0 00-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span className="font-medium text-white">{title}</span>
      </div>
      {children && (
        <p className="mt-2 text-white/70">{children}</p>
      )}
    </div>
  );
}

function WalletIcon(): JSX.Element {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-300/30">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7.5A2.5 2.5 0 015.5 5h11A2.5 2.5 0 0119 7.5v1.25H6.5a1.5 1.5 0 000 3H21V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7.5z"
        />
        <circle cx="16.5" cy="13.25" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

function LockIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
