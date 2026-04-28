"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { DEFAULT_CHAIN, isSupportedChainId } from "@/lib/chain/networks";

/**
 * Full-screen overlay that gates the app whenever a wallet is connected to an
 * unsupported chain. Encourages a single-tap switch to the default Polygon
 * chain. Mobile-first; the action button is the largest visual element.
 *
 * Renders nothing when no wallet is connected, or when the active chain is
 * already supported.
 */
export function NetworkGate(): JSX.Element | null {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected) return null;
  if (isSupportedChainId(chainId)) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="network-gate-title"
      aria-describedby="network-gate-desc"
      className="fixed inset-0 z-40 flex items-end justify-center px-4 py-6 sm:items-center"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0d1228] shadow-[0_30px_120px_-20px_rgba(244,114,182,0.35)]">
        <div className="bg-gradient-to-r from-amber-400/10 via-fuchsia-500/10 to-indigo-500/10 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-300/30">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </span>
            <div>
              <h2
                id="network-gate-title"
                className="text-base font-semibold text-white sm:text-lg"
              >
                Wrong network
              </h2>
              <p className="text-xs text-white/60 sm:text-sm">
                SubSmart runs on Polygon.
              </p>
            </div>
          </div>
          <p
            id="network-gate-desc"
            className="mt-4 text-sm leading-relaxed text-white/70"
          >
            Your wallet is connected to an unsupported chain. Switch to{" "}
            <span className="font-medium text-white">{DEFAULT_CHAIN.name}</span>{" "}
            to continue. Your funds stay in your wallet — SubSmart is fully
            non-custodial.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 sm:px-6 sm:pb-6">
          <button
            type="button"
            onClick={() => switchChain({ chainId: DEFAULT_CHAIN.id })}
            disabled={isPending}
            className="group relative inline-flex min-h-[48px] w-full items-center justify-center overflow-hidden rounded-2xl px-5 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)] transition hover:shadow-[0_14px_50px_-10px_rgba(168,85,247,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
            <span className="relative flex items-center gap-2">
              {isPending ? (
                <>
                  <Spinner />
                  Confirm in your wallet…
                </>
              ) : (
                <>
                  <PolygonGlyph />
                  Switch to {DEFAULT_CHAIN.name}
                </>
              )}
            </span>
          </button>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
            >
              {error.message}
            </p>
          )}

          <p className="px-1 pt-1 text-center text-[11px] text-white/40 sm:text-xs">
            If your wallet doesn&apos;t prompt you, open it manually and approve
            the network change.
          </p>
        </div>
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

function PolygonGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.5 6.5L20 9v6l-4.5 2.5L11 15v-2l4-2v-2l-4-2 4.5-.5zM8.5 6.5L4 9v6l4.5 2.5L13 15v-2l-4-2v-2l4-2-4.5-.5z"
      />
    </svg>
  );
}
