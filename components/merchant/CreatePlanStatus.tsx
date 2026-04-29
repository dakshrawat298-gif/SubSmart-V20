"use client";

import { useEffect, useState } from "react";
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
        {isSuccess && state.planId !== undefined && (
          <CheckoutShare planId={state.planId} />
        )}
        {isSuccess && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              Create another plan
            </button>
          </div>
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

/**
 * Renders the share-checkout-link block. Shows the full URL (read-only),
 * a copy-to-clipboard primary button with transient "Copied!" feedback,
 * and an "Open" link so the merchant can preview the customer view.
 *
 * The URL is built from `window.location.origin` so it works in dev,
 * preview, and production deployments without configuration.
 */
function CheckoutShare({ planId }: { planId: bigint }): JSX.Element {
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const url = origin ? `${origin}/checkout/${planId.toString()}` : "";

  async function handleCopy(): Promise<void> {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-secure contexts (e.g. http previews).
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — leave the URL visible so the user can copy manually.
    }
  }

  return (
    <div
      className="mt-4 rounded-2xl border border-emerald-300/20 bg-[#0d1228]/80 p-3 sm:p-4"
      data-testid="checkout-share"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-300/30">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 13.5a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1 1M13.5 10.5a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1-1"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white">
            Share with customers
          </div>
          <div className="text-[11px] text-white/55">
            Plan #{planId.toString()} · checkout link
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/80 sm:text-xs">
          {url || "Generating link…"}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!url}
          aria-live="polite"
          className={`group relative inline-flex min-h-[44px] flex-1 items-center justify-center overflow-hidden rounded-2xl px-4 text-sm font-medium text-white shadow-[0_8px_28px_-10px_rgba(16,185,129,0.6)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-5 ${
            copied
              ? ""
              : "hover:shadow-[0_12px_36px_-10px_rgba(16,185,129,0.75)]"
          }`}
        >
          <span
            className={`absolute inset-0 transition ${
              copied
                ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500"
                : "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500"
            }`}
          />
          <span className="relative inline-flex items-center gap-2">
            {copied ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12.5l4.5 4.5L19 7"
                  />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 012-2h9" />
                </svg>
                Copy Checkout Link
              </>
            )}
          </span>
        </button>

        {url && (
          <a
            href={`/checkout/${planId.toString()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white/90 transition hover:border-white/25 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            Open
          </a>
        )}
      </div>
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
