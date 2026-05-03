import dynamic from "next/dynamic";

const CustomerDashboardClient = dynamic(
  () =>
    import("@/components/customer/CustomerDashboardClient").then(
      (m) => m.CustomerDashboardClient
    ),
  { ssr: false }
);

/**
 * Customer Portal — server-rendered shell.
 *
 * Static chrome (header, background geometry) is rendered on the server.
 * All wallet-aware, subscription-reading, and cancel logic lives inside
 * CustomerDashboardClient, which is dynamically imported with ssr:false so
 * it never executes on the server — eliminating any possible hydration
 * mismatch from wagmi hooks or window-dependent code.
 *
 * Route: /portal
 */
export default function PortalPage(): JSX.Element {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ── Ambient background geometry ─────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
      >
        {/* Deep base */}
        <div className="absolute inset-0 bg-[#0b1020]" />
        {/* Fuchsia bloom — top-right */}
        <div className="absolute -right-32 -top-24 h-[520px] w-[520px] rounded-full bg-fuchsia-600/[0.07] blur-[120px]" />
        {/* Indigo bloom — bottom-left */}
        <div className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-indigo-600/[0.07] blur-[120px]" />
        {/* Subtle mesh overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <main className="relative mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="mb-8 sm:mb-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-500/[0.07] px-3 py-1 text-[11px] uppercase tracking-widest text-fuchsia-200/70 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]" />
            Customer Portal
          </span>

          <h1 className="mt-3 bg-gradient-to-br from-white via-white/90 to-white/60 bg-clip-text text-2xl font-semibold leading-tight tracking-tight text-transparent sm:text-3xl">
            Active subscriptions
          </h1>

          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/45 sm:text-base">
            Every on-chain recurring plan linked to your wallet. Cancel any time
            — one transaction, immediate effect.
          </p>

          {/* Thin separator */}
          <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>

        {/* ── Client boundary — fully client-side, no SSR ──────────────── */}
        <CustomerDashboardClient />
      </main>
    </div>
  );
}
