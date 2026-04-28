export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70">
        Foundation Ready
      </span>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
        SubSmart V2.0
      </h1>
      <p className="mt-4 max-w-2xl text-base text-white/70 sm:text-lg">
        Decentralized, non-custodial recurring billing protocol for Web3 SaaS on
        the Polygon network.
      </p>
      <p className="mt-8 max-w-xl text-sm text-white/50">
        Architecture and product documentation has been generated under{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">
          /docs
        </code>
        . Application code will be implemented in subsequent steps.
      </p>
    </main>
  );
}
