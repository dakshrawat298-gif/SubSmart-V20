import { CustomerDashboardClient } from "@/components/customer/CustomerDashboardClient";

/**
 * Customer dashboard page — server-rendered shell (§3.2).
 *
 * Static chrome: header, background decor, page heading. All wallet-aware
 * logic lives inside `CustomerDashboardClient` which is the client boundary.
 *
 * Route: /customer
 */
export default function CustomerDashboardPage(): JSX.Element {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundDecor />
      <main className="relative mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-7 sm:mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            My subscriptions
          </span>
          <h1 className="mt-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-2xl font-semibold leading-tight tracking-tight text-transparent sm:text-3xl">
            Active subscriptions
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55 sm:text-base">
            Every active plan on this chain. Charges run automatically — cancel
            any time with a single on-chain transaction.
          </p>
        </div>

        <CustomerDashboardClient />
      </main>
    </div>
  );
}

function BackgroundDecor(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-40 top-10 h-[400px] w-[400px] rounded-full bg-emerald-600/15 blur-3xl" />
      <div className="absolute -right-40 -top-20 h-[400px] w-[400px] rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-600/10 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.04]"
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
