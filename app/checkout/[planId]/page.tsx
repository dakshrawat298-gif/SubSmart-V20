import { CheckoutClient } from "@/components/checkout/CheckoutClient";

// ── Trust footer ──────────────────────────────────────────────────────────────

const AMOY_HUB = "0xBB05A8B21aca3648d8d1E7e72C22001f2A9a505a";
const AMOY_POLYGONSCAN = `https://amoy.polygonscan.com/address/${AMOY_HUB}`;

function CheckoutTrustFooter(): JSX.Element {
  return (
    <footer className="relative w-full pb-6 pt-4">
      {/* Hairline separator */}
      <div
        aria-hidden="true"
        className="mx-auto mb-4 h-px w-full max-w-xl bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
      />

      <div className="flex items-center justify-center gap-3 px-4 text-xs text-white/35">
        {/* Lock icon */}
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-white/30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>

        <span className="tracking-wide">Secured by SubSmart Protocol</span>

        {/* Separator dot */}
        <span aria-hidden="true" className="h-0.5 w-0.5 rounded-full bg-white/20" />

        {/* Polygonscan link */}
        <a
          href={AMOY_POLYGONSCAN}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-150 hover:text-white/55 focus:outline-none focus-visible:rounded focus-visible:ring-1 focus-visible:ring-white/30"
        >
          View Contract ↗
        </a>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  params: { planId: string };
  searchParams?: { name?: string };
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
export default function CheckoutPage({ params, searchParams }: Props): JSX.Element {
  const planName = searchParams?.name?.trim() || undefined;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <main className="relative mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-6 sm:mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]" />
            Customer checkout
          </span>
          <h1 className="mt-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-2xl font-semibold leading-tight tracking-tight text-transparent sm:text-3xl">
            {planName ? planName : "Subscribe to this plan"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55 sm:text-base">
            One signature. Bounded permit. Auto-settled every cycle — you
            never need to sign again.
          </p>
        </div>

        <CheckoutClient planIdParam={params.planId} planNameParam={planName} />
      </main>

      <CheckoutTrustFooter />
    </div>
  );
}

