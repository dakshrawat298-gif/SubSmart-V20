"use client";

import { useState, useEffect } from "react";
import { shortenHash } from "@/lib/utils/format";

// ── Shared type ───────────────────────────────────────────────────────────────
// Exported so CreatePlanForm can import it without a separate types file.

export type CreatedPlan = {
  readonly planId: bigint;
  readonly planName: string;
  readonly amount: string;      // human-readable e.g. "10.00"
  readonly symbol: string;      // e.g. "USDC"
  readonly cycleLabel: string;  // e.g. "Monthly"
  readonly maxCycles: number;
  readonly hash: `0x${string}`;
  readonly createdAt: number;   // Date.now()
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the merchant's local plan inventory — a running list of every plan
 * successfully published on-chain during this browser session (persisted to
 * localStorage so it survives page refreshes).
 *
 * Purely presentational. All state management lives in CreatePlanForm which
 * owns the creation flow and pushes completed plans into this list.
 *
 * Silent Premium design rules:
 *  - bg-white/[0.03] cards with border-white/[0.07] — recessed, not glowing.
 *  - No bold accent colors on data cells; restrained indigo only on actions.
 *  - Plan name is the visual anchor; metadata is secondary (text-white/50).
 */
export function ActivePlansInventory({
  plans,
}: {
  plans: CreatedPlan[];
}): JSX.Element | null {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // Always render the section once there is at least one plan so the merchant
  // can see their inventory. Return null before the first plan is created so
  // the empty state doesn't distract during form fill.
  if (plans.length === 0) return null;

  return (
    <section aria-label="Active subscription plans" className="mt-8">
      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Active Plans
        </h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/40">
          {plans.length}
        </span>
        <span className="ml-auto text-[11px] text-white/25">
          Stored locally · session persisted
        </span>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanCard key={plan.planId.toString()} plan={plan} origin={origin} />
        ))}
      </div>
    </section>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  origin,
}: {
  plan: CreatedPlan;
  origin: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  const checkoutUrl = origin
    ? `${origin}/checkout/${plan.planId.toString()}?name=${encodeURIComponent(plan.planName)}`
    : "";

  async function handleCopy(): Promise<void> {
    if (!checkoutUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(checkoutUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = checkoutUrl;
        ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — URL is visible for manual copy.
    }
  }

  const createdLabel = formatRelativeTime(plan.createdAt);

  return (
    <div className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.05] sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        {/* ── Left: plan identity ──────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Plan ID badge */}
            <span className="inline-flex items-center rounded-lg border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/40">
              #{plan.planId.toString()}
            </span>
            {/* Created timestamp */}
            <span className="text-[11px] text-white/25">{createdLabel}</span>
          </div>

          {/* Plan name — primary visual anchor */}
          <p className="mt-1.5 text-sm font-semibold text-white">
            {plan.planName}
          </p>

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <MetaChip
              label="Amount"
              value={`${plan.amount} ${plan.symbol}`}
            />
            <MetaChip label="Cycle" value={plan.cycleLabel} />
            <MetaChip label="Max cycles" value={String(plan.maxCycles)} />
            {plan.hash && (
              <span className="font-mono text-[11px] text-white/25">
                {shortenHash(plan.hash)}
              </span>
            )}
          </div>
        </div>

        {/* ── Right: copy action ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!checkoutUrl}
          aria-label={
            copied
              ? "Checkout link copied"
              : `Copy checkout link for ${plan.planName}`
          }
          className={[
            "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
            "disabled:cursor-not-allowed disabled:opacity-40",
            copied
              ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/[0.04] text-white/60 hover:border-indigo-300/30 hover:bg-indigo-500/10 hover:text-indigo-200",
          ].join(" ")}
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied!
            </>
          ) : (
            <>
              <LinkIcon />
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <span className="text-[11px] text-white/40">
      <span className="text-white/25">{label}: </span>
      <span className="text-white/55">{value}</span>
    </span>
  );
}

function LinkIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
