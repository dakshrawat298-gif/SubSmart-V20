"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { toast } from "@/lib/toast";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  readonly entry: SubscriptionEntry;
  /**
   * Called after a successful cancel with the cancelled subscriptionId so the
   * parent can optimistically remove the card before the next chain refetch.
   */
  readonly onCancelled: (subscriptionId: `0x${string}`) => void;
};

// ── SubscriptionCard ──────────────────────────────────────────────────────────

/**
 * Renders one active subscription with its plan data, timing fields,
 * and a full cancel-flow state machine.
 *
 * Cancel flow (churn-prevention gate):
 *   1. User clicks "Cancel subscription" → confirmation modal appears.
 *   2. Modal "Keep Plan"  → modal closes, no chain interaction.
 *   3. Modal "Yes, Cancel" → modal closes → useCancel fires wallet prompt.
 *
 * One `useCancel` instance is scoped to this card so multiple cards can be
 * independently in-flight without shared state.
 */
export function SubscriptionCard({ entry, onCancelled }: Props): JSX.Element {
  const chainId = useChainId();
  const chain = getChainById(chainId);
  const { state, cancel, reset } = useCancel();

  // Gate: show confirmation modal before ever touching useCancel.
  const [confirming, setConfirming] = useState(false);

  // After success: fire GlobalToast, then notify parent for optimistic removal.
  useEffect(() => {
    if (state.status !== "success") return;
    toast.success("Subscription cancelled successfully.");
    const t = setTimeout(() => onCancelled(entry.subscriptionId), 1_500);
    return () => clearTimeout(t);
  }, [state.status, onCancelled, entry.subscriptionId]);

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

  function handleConfirmCancel(): void {
    setConfirming(false);
    void cancel(entry.subscriptionId);
  }

  return (
    <>
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

        {/* ── Cancel trigger (idle only — opens modal, NOT the hook) ── */}
        {state.status === "idle" && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
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

      {/* ── Confirmation modal (portal — renders at document.body) ── */}
      {confirming && (
        <CancelConfirmModal
          planId={entry.planId}
          amountLabel={`${formatTokenAmount(entry.amountPerCycle, entry.tokenDecimals)} ${entry.tokenSymbol} / ${formatCycleLengthHuman(entry.cycleLengthSeconds)}`}
          onConfirm={handleConfirmCancel}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </>
  );
}

// ── CancelConfirmModal ────────────────────────────────────────────────────────

/**
 * Glassmorphic confirmation modal rendered into document.body via React portal.
 *
 * Retention-first button hierarchy:
 *   Primary (indigo, filled) → "Keep Plan"  — the safe, encouraged action
 *   Secondary (rose, outline) → "Yes, Cancel" — destructive, visually muted
 *
 * Accessibility:
 *   - Focus is placed on "Keep Plan" on mount (default-safe action).
 *   - Escape key dismisses.
 *   - Backdrop click dismisses.
 *   - role="dialog" + aria-modal + aria-labelledby.
 */
function CancelConfirmModal({
  planId,
  amountLabel,
  onConfirm,
  onDismiss,
}: {
  planId: bigint;
  amountLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}): JSX.Element | null {
  const keepRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  // One-frame defer so the CSS transition fires from the initial hidden state.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Focus the "Keep Plan" button on mount — retention-first default.
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  // Escape to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const content = (
    // Backdrop
    <div
      className={[
        "fixed inset-0 z-[9998] flex items-center justify-center px-4",
        "bg-black/55 backdrop-blur-sm",
        "transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden="true"
      onClick={onDismiss}
    >
      {/* Dialog panel — stop propagation so clicking inside doesn't close */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={[
          "relative w-full max-w-sm overflow-hidden",
          "rounded-3xl border border-white/[0.09] bg-slate-900/90 backdrop-blur-2xl",
          "shadow-[0_32px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
          "transition-all duration-300",
          visible
            ? "translate-y-0 opacity-100 scale-100"
            : "translate-y-4 opacity-0 scale-95",
        ].join(" ")}
      >
        {/* Rose accent gradient — top edge, very subtle */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/50 to-transparent"
        />

        <div className="p-6 sm:p-7">
          {/* Warning icon */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-400 ring-1 ring-inset ring-rose-400/20">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>

          {/* Title */}
          <h2
            id="cancel-modal-title"
            className="mt-4 text-center text-base font-semibold leading-tight text-white"
          >
            Cancel Subscription?
          </h2>

          {/* Plan pill */}
          <p className="mt-2 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-white/50">
              Plan #{planId.toString()} · {amountLabel}
            </span>
          </p>

          {/* Body */}
          <p className="mt-4 text-center text-sm leading-relaxed text-white/55">
            This will revoke the smart contract permit and stop{" "}
            <span className="text-white/75">all future charges</span>{" "}
            immediately. The action cannot be undone without a new subscription.
          </p>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
            {/* PRIMARY: Keep Plan — retention-first, visually dominant */}
            <button
              ref={keepRef}
              type="button"
              onClick={onDismiss}
              className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Keep Plan
            </button>

            {/* SECONDARY: Yes Cancel — muted destructive */}
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-500/[0.09] px-5 text-sm font-medium text-rose-300/90 transition hover:border-rose-300/50 hover:bg-rose-500/[0.16] hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Yes, Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Portal to body — escapes any overflow:hidden ancestor on the card list.
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
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

  return <Banner tone="info" spinner title="Processing…" />;
}

// ── Shared primitives ──────────────────────────────────────────────────────────

const BANNER_TONE = {
  info:    "border-indigo-300/20 bg-indigo-500/[0.08] text-indigo-100",
  success: "border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-100",
  warn:    "border-amber-300/25 bg-amber-500/[0.08] text-amber-100",
  error:   "border-rose-300/25 bg-rose-500/[0.08] text-rose-100",
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
