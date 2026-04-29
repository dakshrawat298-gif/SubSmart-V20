"use client";

import { useMemo } from "react";
import { encodeFunctionData, type Address } from "viem";
import { billingHubAbi } from "@/lib/chain/billingHub";
import type { TokenInfo } from "@/lib/chain/contracts";

type Props = {
  readonly chainId: number | undefined;
  readonly billingHubAddress: Address | undefined;
  readonly selectedToken: TokenInfo | undefined;
  readonly parsedAmount: bigint | undefined;
  readonly cycleSeconds: bigint;
  readonly parsedMaxCycles: number | undefined;
};

type EncodeResult =
  | { readonly ok: true; readonly data: `0x${string}` }
  | { readonly ok: false; readonly error: string };

export function CreatePlanDiagnostics({
  chainId,
  billingHubAddress,
  selectedToken,
  parsedAmount,
  cycleSeconds,
  parsedMaxCycles,
}: Props): JSX.Element {
  const encoded: EncodeResult | null = useMemo(() => {
    if (
      !selectedToken ||
      parsedAmount === undefined ||
      cycleSeconds <= 0n ||
      parsedMaxCycles === undefined
    ) {
      return null;
    }
    try {
      const data = encodeFunctionData({
        abi: billingHubAbi,
        functionName: "createPlan",
        args: [
          selectedToken.address,
          parsedAmount,
          cycleSeconds,
          parsedMaxCycles,
        ],
      });
      return { ok: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }, [selectedToken, parsedAmount, cycleSeconds, parsedMaxCycles]);

  return (
    <details className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-500/[0.03] open:bg-cyan-500/[0.05]">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-widest text-cyan-200/80 hover:text-cyan-100">
        <span className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
          Diagnostics
        </span>
        <span className="text-[10px] text-white/40">tap to expand</span>
      </summary>
      <div className="space-y-2 border-t border-cyan-300/10 px-4 py-3 font-mono text-[11px] leading-relaxed">
        <Row label="Chain ID" value={chainId === undefined ? "—" : String(chainId)} />
        <Row
          label="BillingHub"
          value={billingHubAddress ?? "(not deployed on this chain)"}
          mono
        />
        <Row
          label="Token"
          value={
            selectedToken
              ? `${selectedToken.symbol} · ${selectedToken.address}`
              : "(none selected)"
          }
          mono={!!selectedToken}
        />
        <Row
          label="Amount (wei)"
          value={parsedAmount === undefined ? "—" : parsedAmount.toString()}
        />
        <Row label="Cycle (s)" value={cycleSeconds.toString()} />
        <Row
          label="Max cycles"
          value={parsedMaxCycles === undefined ? "—" : String(parsedMaxCycles)}
        />
        <div className="my-2 h-px bg-cyan-300/10" />
        {encoded === null && (
          <Row
            label="Calldata"
            value="(fill all fields to compute)"
            tone="muted"
          />
        )}
        {encoded?.ok === true && (
          <>
            <Row
              label="Selector"
              value={encoded.data.slice(0, 10)}
              mono
              tone="ok"
            />
            <Row
              label="Calldata len"
              value={`${encoded.data.length - 2} hex chars · ${(encoded.data.length - 2) / 2} bytes`}
              tone="ok"
            />
            <Row
              label="Calldata"
              value={encoded.data}
              mono
              tone="ok"
              wrap
            />
          </>
        )}
        {encoded?.ok === false && (
          <Row label="Encode error" value={encoded.error} tone="err" wrap />
        )}
      </div>
    </details>
  );
}

function Row({
  label,
  value,
  mono = false,
  tone = "neutral",
  wrap = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "muted" | "ok" | "err";
  wrap?: boolean;
}): JSX.Element {
  const toneCls =
    tone === "ok"
      ? "text-emerald-200"
      : tone === "err"
        ? "text-rose-200"
        : tone === "muted"
          ? "text-white/40"
          : "text-white/80";
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-white/45">{label}</span>
      <span
        className={`${toneCls} ${mono ? "font-mono" : ""} ${wrap ? "break-all" : "truncate"}`}
      >
        {value}
      </span>
    </div>
  );
}
