"use client";

import { useEffect } from "react";
import { useChainId } from "wagmi";
import { getChainById } from "@/lib/chain/networks";
import { useCancel } from "@/hooks/useCancel";
import type { SubscriptionEntry } from "@/hooks/useCustomerSubscriptions";
import { shortenAddress } from "@/lib/utils/address";
import {
  formatTokenAmount,
  formatCycleLengthHuman,
  buildExplorerTxUrl,
  shortenHash,
} from "@/lib/utils/format";

type Props = {
  readonly entry: SubscriptionEntry;
  /** Called after a successful cancel so the parent can refetch the list. */
  readonly onCancelled: () => void;
};

/**
 * Renders one active subscription with its plan data, timing fields,
 * and a full cancel-flow state machine.
 *
 * One `useCancel` instance is scoped to this card so multiple cards can be
 * independently in-flight without shared state.
 *
 * After a successful cancel, a 2-second delay lets the user see the success
 * banner before `onCancelled()` triggers a refetch that removes the card.
 */
export function SubscriptionCard({ entry, onCancelled }: Props): JSX.Element {
  const chainId = useChainId();
  const chain = getChainById(chainId);
  const { state, cancel, reset } = useCancel();

  // After success: short pause so the user reads the confirmation, then
  // notify the parent to refetch (card disappears from the list).
  useEffect(() => {
    if (state.status !== "success") return;
    const t = setTimeout(onCancelled, 2_000);
    return () => clearTimeout(t);
  }, [state.status, onCancelled]);

  const cyclesRemaining = entry.cyclesAuthorized - entry.cyclesCharged;
  const nextChargeDate = new Date(
    Number(entry.nextChargeTime) * 1_000
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const isBusy =
    state.status === "simulating" ||
    state.status === "awaiting-signature" ||
    state.status === "mining";

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur-sm sm:p-6">
      {/* ── Card header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            Active · Plan #{entry.planId.toString()}
          </span>
        </div>
        <span className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-white/60">
          {formatTokenAmount(entry.amountPerCycle, entry.tokenDecimals)}{" "}
          {entry.tokenSymbol}
          <span className="text-white/40"> / </span>
          {formatCycleLengthHuman(entry.cycleLengthSeconds)}
        </span>
      </div>

      {/* ── Metadata grid ── */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <DataField
          label="Merchant"
          value={shortenAddress(entry.merchant)}
          mono
        />
        <DataField
          label="Token"
          value={`${entry.tokenSymbol} (${shortenAddress(entry.token)})`}
          mono
        />
        <DataField
          label="Cycle"
          value={formatCycleLengthHuman(entry.cycleLengthSeconds)}
        />
        <DataField
          label="Cycles remaining"
          value={`${cyclesRemaining} of ${entry.cyclesAuthorized}`}
        />
        <DataField label="Next charge" value={nextChargeDate} />
        <DataField
          label="Max cycles"
          value={entry.maxCycles.toString()}
        />
      </dl>

      {/* ── Cancel action ── */}
      {state.status === "idle" && (
        <button
          type="button"
          onClick={() => void cancel(entry.subscriptionId)}
          className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-500/[0.08] px-4 text-sm font-medium text-rose-200 transition hover:border-rose-300/45 hover:bg-rose-500/[0.15] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:w-auto"
        >
          <XIcon />
          Cancel subscription
        </button>
      )}

      {/* ── In-progress / result banners ── */}
      {state.status !== "idle" && (
        <CancelBanner
          state={state}
          isBusy={isBusy}
          chain={chain}
          onReset={reset}
        />
      )}
    </article>
  );
}

// ── CancelBanner ─────────────────────────────────────────────────────────────

function CancelBanner({
  state,
  isBusy,
  chain,
  onReset,
}: {
  state: ReturnType<typeof useCancel>["state"];
  isBusy: boolean;
  chain: ReturnType<typeof getChainById>;
  onReset: () => void;
}): JSX.Element {
  if (state.status === "simulating") {
    return (
      <Banner tone="info" spinner title="Simulating cancel on-chain…" />
    );
  }

  if (state.status === "awaiting-signature") {
    return (
      <Banner tone="info" spinner title="Confirm cancellation in your wallet">
        This transaction calls{" "}
        <span className="font-medium text-white">BillingHub.cancel()</span>.
        Once confirmed, no further charges can be made.
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
            ? "Subscription cancelled"
            : "Cancellation submitted — waiting for confirmation"
        }
      >
        Tx:{" "}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded font-mono text-xs underline decoration-white/30 underline-offset-2 transition hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            {shortenHash(state.hash)}
          </a>
        ) : (
          <span className="font-mono text-xs text-white/70">
            {shortenHash(state.hash)}
          </span>
        )}
        {isSuccess && (
          <p className="mt-1 text-white/60">
            No further charges will be made. Removing from your list…
          </p>
        )}
      </Banner>
    );
  }

  if (state.status === "missing-deployment") {
    return (
      <Banner tone="warn" title="BillingHub not deployed on this chain">
        Switch to Polygon Mainnet or Polygon Amoy to cancel.
      </Banner>
    );
  }

  // status === "error"
  if (state.status === "error") {
    return (
      <Banner tone="error" title="Cancellation failed">
        <span className="block break-words text-rose-100/90">
          {state.message}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 text-xs font-medium text-rose-100 transition hover:border-rose-300/50 hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        >
          Try again
        </button>
      </Banner>
    );
  }

  // isBusy guard — should not be reachable with the above branches
  return <Banner tone="info" spinner title="Processing…" />;
}

// ── Shared primitives ─────────────────────────────────────────────────────

const BANNER_TONE = {
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
  tone: keyof typeof BANNER_TONE;
  title: string;
  children?: React.ReactNode;
  spinner?: boolean;
}): JSX.Element {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`rounded-2xl border p-4 text-sm ${BANNER_TONE[tone]}`}
    >
      <div className="flex items-center gap-2">
        {spinner && <Spinner />}
        <span className="font-medium text-white">{title}</span>
      </div>
      {children && <div className="mt-2 text-sm text-white/75">{children}</div>}
    </div>
  );
}

function DataField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </dt>
      <dd
        className={`truncate text-sm text-white/85 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Spinner(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin text-white/90"
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

function XIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
