import { ConnectButton } from "@/components/web3/ConnectButton";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

type Props = {
  params: { planId: string };
};

/**
 * Customer checkout page — public, server-rendered for SEO and TTFB (§3.2).
 *
 * This component owns only static chrome (header, layout, background decor).
 * All wallet-aware, RPC-dependent logic lives in `<CheckoutClient>` which
 * declares `"use client"` and is as small as possible (§3.2 rule: client
 * components should be leaf-level and minimal).
 *
 * The `planId` URL segment is passed as a raw string to `CheckoutClient`
 * which parses + validates it — server components must not import viem
 * (client-only) just for a BigInt parse.
 */
export default function CheckoutPage({ params }: Props): JSX.Element {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundDecor />

      <header className="relative flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <a
          href="/"
          className="flex min-w-0 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded-lg"
          aria-label="SubSmart home"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.7)]">
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
                d="M4 7h12a4 4 0 010 8H8a4 4 0 010-8h8"
              />
            </svg>
          </span>
          <span className="truncate text-sm font-semibold tracking-wide text-white sm:text-base">
            SubSmart
            <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-normal text-white/60">
              V2.0
            </span>
          </span>
        </a>
        <div className="shrink-0">
          <ConnectButton />
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-xl px-4 pb-20 pt-4 sm:px-6 sm:pt-8">
        <div className="mb-6 sm:mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]" />
            Customer checkout
          </span>
          <h1 className="mt-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-2xl font-semibold leading-tight tracking-tight text-transparent sm:text-3xl">
            Subscribe to this plan
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55 sm:text-base">
            One signature. Bounded permit. Auto-settled every cycle — you
            never need to sign again.
          </p>
        </div>

        <CheckoutClient planIdParam={params.planId} />
      </main>
    </div>
  );
}

function BackgroundDecor(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="absolute -left-40 top-20 h-[380px] w-[380px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="absolute -right-40 -top-20 h-[380px] w-[380px] rounded-full bg-indigo-600/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at top, rgba(0,0,0,0.6), transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top, rgba(0,0,0,0.6), transparent 70%)",
        }}
      />
    </div>
  );
}
