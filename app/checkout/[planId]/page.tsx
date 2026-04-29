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

      <main className="relative mx-auto w-full max-w-xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
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
