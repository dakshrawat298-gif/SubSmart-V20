"use client";

import { useChainId } from "wagmi";
import { getChainById } from "@/lib/chain/networks";
import type { CreatePlanState } from "@/hooks/useCreatePlan";
import { buildExplorerTxUrl, shortenHash } from "@/lib/utils/format";

/**
 * Renders the create-plan flow's state machine into a single status panel.
 * Pure presentational — no hooks except `useChainId` (read-only) for the
 * Polygonscan link. The parent owns all action handlers.
 *
 * Per AI guidelines §4.3, the tx hash + explorer link are shown the moment a
 * hash is available — well before the receipt confirms — so the user can
 * track the transaction in their preferred explorer.
 */
export function CreatePlanStatus({
  state,
  onReset,
}: {
  state: CreatePlanState;
  onReset: () => void;
}): JSX.Element | null {
  const chainId = useChainId();
  const chain = getChainById(chainId);

  if (state.status === "idle") return null;

  if (state.status === "missing-deployment") {
    return (
      <Banner tone="warn" title="No BillingHub deployed on this chain">
        Set <code className="font-mono text-xs">NEXT_PUBLIC_BILLING_HUB_ADDRESS_*</code>{" "}
        for chain id {state.chainId} and reload, or switch to a chain where the
        contract is deployed.
      </Banner>
    );
  }

  if (state.status === "simulating") {
    return <Banner tone="info" spinner title="Simulating on-chain…" />;
  }

  if (state.status === "awaiting-signature") {
    return (
      <Banner tone="info" spinner title="Confirm in your wallet">
        Approve the <span className="font-medium text-white">createPlan</span>{" "}
        transaction to publish your plan on-chain.
      </Banner>
    );
  }

  if (state.status === "mining" || state.status === "success") {
    const url = buildExplorerTxUrl(chain, state.hash);
    const isSuccess = state.status === "success";
    return (
      <Banner
        tone={isSuccess ? "success" : "info"}
        spinner={!isSuccess}
        title={
          isSuccess
            ? "Plan created on-chain"
            : "Transaction submitted — waiting for confirmation"
        }
      >
        <span className="block">
          Tx hash:{" "}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded font-mono text-xs underline decoration-white/30 underline-offset-2 outline-none transition hover:decoration-white focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              {shortenHash(state.hash)}
            </a>
          ) : (
            <span className="font-mono text-xs text-white/70">
              {shortenHash(state.hash)}
            </span>
          )}
        </span>
        {isSuccess && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            Create another plan
          </button>
        )}
      </Banner>
    );
  }

  // status === "error"
  return (
    <Banner tone="error" title="Transaction failed">
      <span className="block break-words text-rose-100/90">{state.message}</span>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 text-sm font-medium text-rose-100 transition hover:border-rose-300/50 hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        Try again
      </button>
    </Banner>
  );
}

const TONE_STYLES = {
  info: "border-indigo-300/20 bg-indigo-500/[0.08] text-indigo-100",
  success: "border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-100",
  warn: "border-amber-300/25 bg-amber-500/[0.08] text-amber-100",
  error: "border-rose-300/25 bg-rose-500/[0.08] text-rose-100",
} as const;

function Banner({
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
      className={`mt-5 rounded-2xl border p-4 text-sm sm:p-5 ${TONE_STYLES[tone]}`}
    >
      <div className="flex items-center gap-2">
        {spinner && <Spinner />}
        <div className="font-medium text-white">{title}</div>
      </div>
      {children && <div className="mt-2 text-sm text-white/75">{children}</div>}
    </div>
  );
}

function Spinner(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white/90"
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
  );
}
