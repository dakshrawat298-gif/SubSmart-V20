"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useMerchantAnalytics } from "@/hooks/useMerchantAnalytics";
import type { CreatedPlan } from "./ActivePlansInventory";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRevenue(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Merchant analytics panel — reads on-chain `Charged` events for the connected
 * wallet and displays aggregate revenue, charge count, and a block-bucketed
 * sparkline activity chart.
 *
 * Purely client-side. Dynamically imported with ssr:false in CreatePlanForm
 * so no wagmi hook or window reference ever executes server-side.
 */
export function MerchantAnalytics({
  createdPlans,
}: {
  createdPlans: CreatedPlan[];
}): JSX.Element | null {
  const { isConnected } = useAccount();

  // Build planId→name map once; passed to hook for log enrichment.
  const planNames = useMemo(
    () => new Map(createdPlans.map((p) => [p.planId.toString(), p.planName])),
    // Stringify planIds so the map reference changes only when content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createdPlans.map((p) => p.planId.toString()).join(",")]
  );

  const { totalRevenue, totalCharges, perPlan, sparkline, scannedBlocks, isLoading, error, refetch } =
    useMerchantAnalytics(planNames);

  // Don't render until wallet is connected — the form already shows a connect
  // gate, so showing an empty analytics section would be visual noise.
  if (!isConnected) return null;

  return (
    <section aria-label="Revenue analytics" className="mt-8">
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Revenue &amp; Analytics
        </h2>
        {scannedBlocks > 0 && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/30">
            Last ~{scannedBlocks.toLocaleString()} blocks
          </span>
        )}
        <button
          type="button"
          onClick={refetch}
          disabled={isLoading}
          aria-label="Refresh analytics"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/35 transition hover:border-white/[0.12] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-300"
        >
          {isLoading ? <SpinnerMini /> : <RefreshIcon />}
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-300/20 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-100/80"
        >
          {error}
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total Revenue"
          value={isLoading ? null : `$${fmtRevenue(totalRevenue)}`}
          sub="USDC"
          accent="emerald"
        />
        <StatCard
          label="Charges"
          value={isLoading ? null : totalCharges.toString()}
          sub="on-chain"
          accent="indigo"
        />
        <StatCard
          label="Plans"
          value={createdPlans.length.toString()}
          sub="created"
          accent="none"
        />
      </div>

      {/* ── Sparkline ───────────────────────────────────────────────────── */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 pb-3 pt-4">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-white/25">
          Charge activity · recent blocks
        </p>
        <Sparkline values={sparkline} isLoading={isLoading} />
      </div>

      {/* ── Per-plan breakdown ──────────────────────────────────────────── */}
      {perPlan.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-2.5 text-left font-medium uppercase tracking-widest text-white/30">
                  Plan
                </th>
                <th className="px-4 py-2.5 text-right font-medium uppercase tracking-widest text-white/30">
                  Charges
                </th>
                <th className="px-4 py-2.5 text-right font-medium uppercase tracking-widest text-white/30">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {perPlan.map((row, i) => (
                <tr
                  key={row.planId.toString()}
                  className={
                    i < perPlan.length - 1
                      ? "border-b border-white/[0.04]"
                      : ""
                  }
                >
                  <td className="px-4 py-2.5">
                    <span className="mr-2 rounded border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/35">
                      #{row.planId.toString()}
                    </span>
                    <span className="text-white/70">{row.planName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white/55">
                    {row.chargeCount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white/75">
                    ${fmtRevenue(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state — wallet connected but no charges in scanned window */}
      {!isLoading && !error && totalCharges === 0 && (
        <p className="mt-3 text-center text-[11px] text-white/20">
          No charges found in the last ~{scannedBlocks.toLocaleString()} blocks
        </p>
      )}
    </section>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

const ACCENT_COLORS = {
  emerald: "text-emerald-300",
  indigo:  "text-indigo-300",
  none:    "text-white/80",
} as const;

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | null;
  sub: string;
  accent: keyof typeof ACCENT_COLORS;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <span className="text-[10px] uppercase tracking-widest text-white/30">
        {label}
      </span>
      {value === null ? (
        <div className="mt-1 h-5 w-2/3 animate-pulse rounded bg-white/[0.06]" />
      ) : (
        <span
          className={`text-lg font-semibold tabular-nums leading-tight ${ACCENT_COLORS[accent]}`}
        >
          {value}
        </span>
      )}
      <span className="text-[10px] text-white/20">{sub}</span>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

/**
 * Pure SVG sparkline — 24 vertical bars, no external library.
 * Bar fill shifts from white/10 → indigo/60 as height increases.
 */
function Sparkline({
  values,
  isLoading,
}: {
  values: readonly number[];
  isLoading: boolean;
}): JSX.Element {
  const H = 48;       // chart height px
  const GAP = 3;      // gap between bars px
  const RADIUS = 2;   // bar corner radius

  const barW = useMemo(() => {
    // Recalculate bar width based on number of values + gaps
    // We render in a 100%-wide SVG with viewBox, so width is relative
    return 100 / values.length - GAP;
  }, [values.length]);

  if (isLoading) {
    return (
      <div className="flex h-12 items-end gap-0.5">
        {values.map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-sm bg-white/[0.05]"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    );
  }

  const hasActivity = values.some((v) => v > 0);

  return (
    <svg
      viewBox={`0 0 100 ${H}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      aria-label="Charge activity sparkline"
      role="img"
    >
      {values.map((v, i) => {
        const barH = Math.max(v * H, hasActivity ? 2 : H * 0.08);
        const x = i * (barW + GAP);
        const y = H - barH;

        // Shift fill: low = white/8, high = indigo-400/50
        const opacity = hasActivity ? 0.08 + v * 0.55 : 0.06;
        const isHot = v > 0.6;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={RADIUS}
            ry={RADIUS}
            fill={isHot ? "rgba(129,140,248,0.65)" : `rgba(255,255,255,${opacity.toFixed(2)})`}
          />
        );
      })}

      {/* Baseline */}
      <line
        x1="0" y1={H} x2="100" y2={H}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function RefreshIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
    </svg>
  );
}

function SpinnerMini(): JSX.Element {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
