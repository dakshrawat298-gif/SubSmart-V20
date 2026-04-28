"use client";

import type { PermitSummary } from "@/hooks/usePermitSignature";
import type { BoundedAuthorization } from "@/lib/chain/permit";
import {
  formatTokenAmount,
  formatCycleLengthHuman,
  formatDeadline,
} from "@/lib/utils/format";
import { shortenAddress } from "@/lib/utils/address";

type Props = {
  readonly summary: PermitSummary;
  readonly authorization: BoundedAuthorization;
};

/**
 * Human-readable summary of the bounded permit the customer is about to sign.
 *
 * Per AI guidelines §4.2 this component MUST be rendered before `sign()` is
 * invoked. It shows every parameter of the EIP-2612 Permit so there are zero
 * surprises in the wallet prompt:
 *
 *  - Token symbol + spender (checksummed, shortened).
 *  - Amount per cycle and the derived total authorization.
 *  - Deadline, rendered as a locale date string (not a raw Unix timestamp).
 *  - The periodic charge schedule the customer is authorizing.
 *
 * Pure presentational — no hooks, no RPC calls.
 */
export function AllowanceDisclosure({
  summary,
  authorization,
}: Props): JSX.Element {
  const cycleLengthLabel = formatCycleLengthHuman(summary.cycleLengthSeconds);
  const amountFormatted = formatTokenAmount(
    summary.amountPerCycle,
    summary.decimals
  );
  const totalFormatted = formatTokenAmount(
    summary.totalAuthorized,
    summary.decimals
  );
  const deadlineFormatted = formatDeadline(summary.deadlineUnixSeconds);

  return (
    <div
      role="region"
      aria-label="Authorization summary"
      className="rounded-2xl border border-indigo-300/20 bg-indigo-500/[0.06] p-4 sm:p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldIcon />
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
          Bounded Authorization
        </span>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-white/75">
        Your wallet will sign a single{" "}
        <span className="font-medium text-white">EIP-2612 Permit</span> — no
        gas required. This authorizes the protocol to charge you{" "}
        <span className="font-medium text-white">
          {amountFormatted} {summary.tokenSymbol}
        </span>{" "}
        every {cycleLengthLabel}, for up to{" "}
        <span className="font-medium text-white">
          {authorization.maxCycles} cycle
          {authorization.maxCycles !== 1 ? "s" : ""}
        </span>
        . The permit expires on{" "}
        <span className="font-medium text-white">{deadlineFormatted}</span>.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Row
          label="Amount per cycle"
          value={`${amountFormatted} ${summary.tokenSymbol}`}
        />
        <Row
          label="Billing period"
          value={`Every ${cycleLengthLabel}`}
        />
        <Row
          label="Cycles authorized"
          value={`${authorization.maxCycles}`}
        />
        <Row
          label="Total authorized"
          value={`${totalFormatted} ${summary.tokenSymbol}`}
          highlight
        />
        <Row
          label="Permit expires"
          value={deadlineFormatted}
        />
        <Row
          label="Authorized spender"
          value={shortenAddress(summary.spender)}
          mono
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        This is a <em>bounded</em> permit — not an infinite approval. The
        contract enforces an independent per-cycle spending ledger and the
        authorization expires automatically. You cannot be charged more than{" "}
        {amountFormatted} {summary.tokenSymbol} per {cycleLengthLabel}, and
        never more than {totalFormatted} {summary.tokenSymbol} in total.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
  mono = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <span className="shrink-0 text-[11px] text-white/45">{label}</span>
      <span
        className={
          "text-right text-xs font-medium " +
          (highlight ? "text-indigo-200" : "text-white/90") +
          (mono ? " font-mono" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}

function ShieldIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-indigo-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      />
    </svg>
  );
}
