"use client";

import type { PlanData } from "@/hooks/useSubscribe";
import { getTokenByAddress } from "@/lib/chain/contracts";
import {
  formatTokenAmount,
  formatCycleLengthHuman,
} from "@/lib/utils/format";
import { shortenAddress } from "@/lib/utils/address";

type Props = {
  readonly planId: bigint;
  readonly plan: PlanData;
  readonly chainId: number;
  readonly planName?: string;
};

/**
 * Presentational card displaying on-chain plan metadata.
 *
 * Pure presentational — receives all data as props. No hooks, no RPC.
 * Renders: billing token, amount per cycle, cycle length, max cycles, merchant
 * address, and a plain-language description of the total commitment.
 *
 * Per §3.1: single responsibility (display plan data). Wallet-unaware.
 */
export function PlanSummaryCard({ planId, plan, chainId, planName }: Props): JSX.Element {
  const token = getTokenByAddress(chainId, plan.token);
  const symbol = token?.symbol ?? "tokens";
  const decimals = token?.decimals ?? 18;

  const amountFormatted = formatTokenAmount(plan.amountPerCycle, decimals);
  const cycleLengthLabel = formatCycleLengthHuman(plan.cycleLengthSeconds);
  const totalBigint = plan.amountPerCycle * BigInt(plan.maxCycles);
  const totalFormatted = formatTokenAmount(totalBigint, decimals);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur sm:p-7">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          Active plan
        </span>
        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/50">
          #{planId.toString()}
        </span>
      </div>

      {planName && (
        <p className="mt-2 text-base font-semibold text-white sm:text-lg">
          {planName}
        </p>
      )}

      <h2 className="mt-1 bg-gradient-to-b from-white to-white/70 bg-clip-text text-xl font-semibold leading-tight tracking-tight text-transparent sm:text-2xl">
        {amountFormatted}{" "}
        <span className="text-indigo-300">{symbol}</span> / {cycleLengthLabel}
      </h2>
      <p className="mt-1 text-sm text-white/55">
        {plan.maxCycles} cycle{plan.maxCycles !== 1 ? "s" : ""} ·{" "}
        {totalFormatted} {symbol} maximum total commitment
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Per cycle" value={`${amountFormatted} ${symbol}`} />
        <Stat label="Every" value={cycleLengthLabel} />
        <Stat label="Cycles" value={plan.maxCycles.toString()} />
        <Stat label="Total max" value={`${totalFormatted} ${symbol}`} />
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
        <span className="block text-[11px] text-white/40">
          Merchant receiving address
        </span>
        <span className="mt-0.5 block font-mono text-xs text-white/70 break-all">
          {shortenAddress(plan.merchant)}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-white/35">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-white">{value}</div>
    </div>
  );
}
