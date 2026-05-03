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

