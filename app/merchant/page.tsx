import { CreatePlanScreen } from "./CreatePlanScreen";

/**
 * Merchant dashboard shell. Server-rendered by default; the wallet-aware
 * pieces live inside `CreatePlanScreen` (a client component). Per AI
 * guidelines §3.2, this keeps the static chrome out of the client bundle.
 */
export default function MerchantDashboardPage(): JSX.Element {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundDecor />
      <main className="relative mx-auto w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-6 sm:mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
            New plan
          </span>
          <h1 className="mt-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-2xl font-semibold leading-tight tracking-tight text-transparent sm:text-3xl">
            Create a recurring billing plan
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60 sm:text-base">
            Plans are immutable once published. Customers subscribe with a
            single bounded permit signature.
          </p>
        </div>
        <CreatePlanScreen />
      </main>
    </div>
  );
}

function BackgroundDecor(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-indigo-600/25 blur-3xl" />
      <div className="absolute -right-40 top-40 h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.06]"
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
