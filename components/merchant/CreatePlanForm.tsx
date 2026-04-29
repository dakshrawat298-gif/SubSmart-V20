"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { parseUnits, type Address } from "viem";
import { getTokensForChain, type TokenInfo } from "@/lib/chain/contracts";
import { getBillingHubAddress } from "@/lib/chain/billingHub";
import { CYCLE_PRESETS } from "@/lib/utils/format";
import { useCreatePlan } from "@/hooks/useCreatePlan";
import { CreatePlanStatus } from "./CreatePlanStatus";

type FormState = {
  readonly tokenAddress: Address | "";
  readonly amount: string;
  readonly cycleSeconds: bigint;
  readonly maxCycles: string;
};

const INITIAL_CYCLE = CYCLE_PRESETS[2].seconds; // monthly
const INITIAL: FormState = {
  tokenAddress: "",
  amount: "",
  cycleSeconds: INITIAL_CYCLE,
  maxCycles: "12",
};

/**
 * Merchant-facing form to create a new on-chain billing plan.
 *
 * Compliance highlights:
 *  - §4.5: token is a select bound to `getTokensForChain()` — the merchant
 *    cannot type an arbitrary token address.
 *  - §3.3: mobile-first, 44px+ tap targets, single-column on small screens.
 *  - §4.3: write/simulate/wait orchestration is delegated to `useCreatePlan`.
 *  - §2: discriminated-union state machine for status; no `any` anywhere.
 *
 * Local input state stays as strings until submit so the merchant can type
 * freely (incl. partial decimals) without intermediate parse errors. Parsing
 * to `bigint` is performed once at submit time using the token's `decimals`.
 */
export function CreatePlanForm(): JSX.Element {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const tokens = useMemo(() => getTokensForChain(chainId), [chainId]);
  const { state, submit, reset } = useCreatePlan();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [validationError, setValidationError] = useState<string | undefined>();

  const isBusy =
    state.status === "simulating" ||
    state.status === "awaiting-signature" ||
    state.status === "mining";

  const selectedToken: TokenInfo | undefined = useMemo(
    () => tokens.find((t) => t.address === form.tokenAddress),
    [tokens, form.tokenAddress]
  );

  // Hard guard: the submit button is only enabled once every input is fully
  // populated and the chain is known to have a deployed BillingHub. This
  // makes it physically impossible to fire `submit()` with partial state
  // — the click is the entry point for any `0x` empty-calldata risk.
  const billingHubAddress = useMemo(
    () => getBillingHubAddress(chainId),
    [chainId]
  );
  const parsedAmount = useMemo<bigint | undefined>(() => {
    if (!selectedToken) return undefined;
    const trimmed = form.amount.trim();
    if (!trimmed) return undefined;
    try {
      const wei = parseUnits(trimmed, selectedToken.decimals);
      return wei > 0n ? wei : undefined;
    } catch {
      return undefined;
    }
  }, [form.amount, selectedToken]);
  const parsedMaxCycles = useMemo<number | undefined>(() => {
    const n = Number(form.maxCycles);
    if (!Number.isInteger(n) || n < 1 || n > 4_294_967_295) return undefined;
    return n;
  }, [form.maxCycles]);
  const isFormReady =
    isConnected &&
    !!billingHubAddress &&
    !!selectedToken &&
    parsedAmount !== undefined &&
    form.cycleSeconds > 0n &&
    parsedMaxCycles !== undefined;
  const canSubmit = isFormReady && !isBusy;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setValidationError(undefined);

    // Hard guard mirror — even if the disabled button is bypassed (e.g. via
    // devtools or a stray Enter keypress), refuse to call submit() unless
    // every value is present and parsed. This is the second layer; the hook
    // itself is the third (and never sends empty calldata).
    if (!isConnected) {
      setValidationError("Connect your wallet first.");
      return;
    }
    if (!billingHubAddress) {
      setValidationError(
        "BillingHub is not deployed on the active chain — switch to Polygon Amoy."
      );
      return;
    }
    if (!selectedToken) {
      setValidationError("Pick a payment token from the list.");
      return;
    }
    if (parsedAmount === undefined) {
      setValidationError("Amount per cycle must be a positive number.");
      return;
    }
    if (form.cycleSeconds <= 0n) {
      setValidationError("Pick a billing cycle.");
      return;
    }
    if (parsedMaxCycles === undefined) {
      setValidationError(
        "Max cycles must be an integer between 1 and 4294967295."
      );
      return;
    }

    await submit({
      token: selectedToken.address,
      amountPerCycle: parsedAmount,
      cycleLengthSeconds: form.cycleSeconds,
      maxCycles: parsedMaxCycles,
    });
  }

  const tokensUnavailable = tokens.length === 0;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur sm:p-7"
    >
      <Field id="token" label="Payment token">
        <select
          id="token"
          value={form.tokenAddress}
          onChange={(e) =>
            setForm({ ...form, tokenAddress: e.target.value as Address | "" })
          }
          disabled={tokensUnavailable || isBusy}
          required
          className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#0d1228] px-3 text-sm text-white outline-none ring-0 transition focus:border-indigo-300/60 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-60"
        >
          <option value="" disabled>
            {tokensUnavailable ? "No tokens for this chain" : "Select a token…"}
          </option>
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol} — {t.name}
            </option>
          ))}
        </select>
        <Hint>
          Tokens are restricted to the protocol allow-list for security.
        </Hint>
      </Field>

      <Field id="amount" label="Amount per cycle">
        <div className="relative">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="10.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            disabled={isBusy}
            required
            aria-describedby="amount-hint"
            className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1228] pl-3 pr-16 text-sm text-white outline-none transition focus:border-indigo-300/60 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-60"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/60">
            {selectedToken?.symbol ?? "—"}
          </span>
        </div>
        <Hint id="amount-hint">
          Charged once per cycle. Subscribers approve a bounded permit covering
          this amount × the number of cycles they authorize.
        </Hint>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cycle" label="Billing cycle">
          <select
            id="cycle"
            value={form.cycleSeconds.toString()}
            onChange={(e) =>
              setForm({ ...form, cycleSeconds: BigInt(e.target.value) })
            }
            disabled={isBusy}
            className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#0d1228] px-3 text-sm text-white outline-none transition focus:border-indigo-300/60 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-60"
          >
            {CYCLE_PRESETS.map((p) => (
              <option key={p.label} value={p.seconds.toString()}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="maxCycles" label="Max cycles">
          <input
            id="maxCycles"
            type="number"
            min={1}
            step={1}
            value={form.maxCycles}
            onChange={(e) => setForm({ ...form, maxCycles: e.target.value })}
            disabled={isBusy}
            required
            className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1228] px-3 text-sm text-white outline-none transition focus:border-indigo-300/60 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-60"
          />
        </Field>
      </div>

      {validationError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          {validationError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        title={
          canSubmit
            ? undefined
            : !isConnected
              ? "Connect your wallet to continue"
              : !billingHubAddress
                ? "Switch to Polygon Amoy"
                : !selectedToken
                  ? "Pick a payment token"
                  : parsedAmount === undefined
                    ? "Enter an amount per cycle"
                    : parsedMaxCycles === undefined
                      ? "Enter a valid max cycles"
                      : undefined
        }
        className="group relative mt-6 inline-flex min-h-[48px] w-full items-center justify-center overflow-hidden rounded-2xl px-5 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)] transition hover:shadow-[0_14px_50px_-10px_rgba(168,85,247,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
        <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 opacity-0 transition group-hover:opacity-100" />
        <span className="relative">
          {isBusy ? "Working…" : "Publish plan on-chain"}
        </span>
      </button>

      <CreatePlanStatus state={state} onReset={reset} />
    </form>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-4">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/50"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Hint({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <p id={id} className="mt-1.5 text-[11px] leading-relaxed text-white/45 sm:text-xs">
      {children}
    </p>
  );
}
