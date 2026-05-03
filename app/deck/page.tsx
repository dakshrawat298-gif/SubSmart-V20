"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Slide metadata ─────────────────────────────────────────────────────────────

const SLIDES = [
  { id: "hero",     label: "Intro"    },
  { id: "problem",  label: "Problem"  },
  { id: "solution", label: "Solution" },
  { id: "builder",  label: "Builder"  },
  { id: "ask",      label: "The Ask"  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeckPage(): JSX.Element {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Intersection observer: animation triggers + active dot ───────────────
  useEffect(() => {
    // 1. Scroll-reveal: add .in-view to [data-animate] when entering viewport
    const animEls = document.querySelectorAll("[data-animate]");
    const animObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 }
    );
    animEls.forEach((el) => animObs.observe(el));

    // 2. Active slide tracking for nav dots
    const sections = document.querySelectorAll("[data-slide-index]");
    const slideObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setCurrent(
              Number((e.target as HTMLElement).dataset.slideIndex)
            );
          }
        });
      },
      { threshold: 0.5 }
    );
    sections.forEach((s) => slideObs.observe(s));

    return () => {
      animObs.disconnect();
      slideObs.disconnect();
    };
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, index));
    document
      .querySelector(`[data-slide-index="${clamped}"]`)
      ?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(current + 1);
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(current - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, goTo]);

  return (
    // Full-screen scroll-snap container
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-y-scroll bg-black text-white"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {/* ── S1: Hero ──────────────────────────────────────────────────────── */}
      <section
        data-slide-index="0"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Radial glow — indigo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "900px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div
            data-animate
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50 backdrop-blur-sm"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
            Polygon Amoy · Testnet Live
          </div>

          {/* Title */}
          <h1
            data-animate
            data-delay="200"
            className="bg-gradient-to-b from-white via-white to-white/40 bg-clip-text text-[clamp(3.5rem,10vw,8.5rem)] font-bold leading-[0.9] tracking-tight text-transparent"
          >
            SubSmart
            <br />
            Protocol
          </h1>

          {/* Subtitle */}
          <p
            data-animate
            data-delay="400"
            className="mx-auto mt-8 max-w-xl text-[clamp(1rem,2.5vw,1.25rem)] font-light leading-relaxed text-white/50"
          >
            Decentralized, non-custodial recurring billing — on-chain.
            <br />
            <span className="text-white/30 font-medium tracking-wide">
              No escrow. No intermediaries. No compromises.
            </span>
          </p>

          {/* Chain pill */}
          <div
            data-animate
            data-delay="600"
            className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/40 backdrop-blur-md px-5 py-2.5 transition-transform hover:scale-105"
          >
            <span className="font-mono text-xs text-white/30">Contract</span>
            <span className="font-mono text-xs text-white/70 tracking-wider">
              0xBB05…505a
            </span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span className="font-mono text-xs font-semibold text-emerald-400">
              Deployed
            </span>
          </div>

          {/* Scroll hint */}
          <div
            data-animate
            data-delay="700"
            className="mt-16 flex flex-col items-center gap-2"
          >
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/20 font-semibold">
              Scroll to explore
            </span>
            <svg
              className="h-4 w-4 animate-bounce text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* ── S2: Problem ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="1"
        className="relative flex h-[100dvh] flex-col justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — rose */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 top-1/2 -translate-y-1/2"
          style={{
            width: "700px",
            height: "500px",
            background:
              "radial-gradient(ellipse at left, rgba(244,63,94,0.12) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          {/* Eyebrow */}
          <p
            data-animate
            className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-rose-400/80"
          >
            The Problem
          </p>

          {/* Headline */}
          <h2
            data-animate
            data-delay="100"
            className="max-w-2xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
          >
            Web3 Can&apos;t
            <br />
            Bill Customers.
          </h2>

          <p
            data-animate
            data-delay="200"
            className="mt-6 max-w-lg text-base leading-relaxed text-white/50 sm:text-lg"
          >
            SaaS demands automated revenue. Web3 demands manual signatures.
            The current infrastructure is fundamentally broken.
          </p>

          {/* Pain point cards - Apple level polish (less text, more impact) */}
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: "🔒",
                title: "Custodial Escrow",
                body: "Funds locked in 3rd-party vaults. High counterparty risk.",
                delay: "300",
              },
              {
                icon: "⛽",
                title: "Gas-Intensive",
                body: "Bots bleed gas on every loop. Unit economics break at scale.",
                delay: "400",
              },
              {
                icon: "🏦",
                title: "Centralized Ops",
                body: "Off-chain servers managing on-chain funds. A single point of failure.",
                delay: "500",
              },
            ].map((card) => (
              <div
                key={card.title}
                data-animate
                data-delay={card.delay}
                className="group rounded-2xl border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent p-6 transition-all hover:bg-white/[0.05]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                  {card.icon}
                </div>
                <h3 className="text-base font-semibold text-white/90">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/40">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S3: Solution ──────────────────────────────────────────────────── */}
      <section
        data-slide-index="2"
        className="relative flex h-[100dvh] flex-col justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — emerald */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
          style={{
            width: "600px",
            height: "600px",
            background:
              "radial-gradient(circle at right, rgba(16,185,129,0.1) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl grid items-center gap-12 lg:grid-cols-2">
          {/* Left Text Block */}
          <div>
            <p
              data-animate
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/80"
            >
              The Solution
            </p>

            <h2
              data-animate
              data-delay="100"
              className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
            >
              One Permit.
              <br />
              Zero Escrow.
            </h2>

            <p
              data-animate
              data-delay="200"
              className="mt-6 text-base leading-relaxed text-white/50 sm:text-lg"
            >
              The subscriber signs a single EIP-2612 gasless permit. 
              The merchant calls <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-xs text-emerald-300">charge()</code>. 
              Funds move directly peer-to-peer.
            </p>

            <div className="mt-10 space-y-6">
              {[
                { title: "Zero Lockup", text: "Merchants get paid instantly. No withdrawal delays." },
                { title: "Math-Enforced Limits", text: "Hard-coded cycle limits. Overcharging is cryptographically impossible." },
                { title: "Non-Custodial", text: "SubSmart coordinates the billing, but never touches the funds." }
              ].map((item, idx) => (
                <div data-animate data-delay={300 + idx * 100} key={item.title} className="flex gap-4">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  <div>
                    <h4 className="text-sm font-semibold text-white/90">{item.title}</h4>
                    <p className="mt-1 text-sm text-white/40">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Visual Block - Sleek Code/Architecture UI */}
          <div data-animate data-delay="600" className="hidden lg:block relative rounded-2xl border border-white/10 bg-[#0a0a0a] p-2 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-2xl pointer-events-none" />
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <p className="ml-4 font-mono text-[10px] text-white/30">SubSmart_Core.sol</p>
            </div>
            <div className="p-6 font-mono text-[13px] leading-relaxed text-white/60">
              <p><span className="text-violet-400">function</span> <span className="text-blue-400">charge</span>(bytes <span className="text-orange-300">calldata</span> permit) <span className="text-violet-400">external</span> {"{"}</p>
              <p className="ml-4 opacity-50">// 1. Verify EIP-2612 Signature</p>
              <p className="ml-4">verifySignature(permit);</p>
              <p className="ml-4 mt-2 opacity-50">// 2. Check Cycle Limits</p>
              <p className="ml-4"><span className="text-violet-400">require</span>(cyclesRun &lt; maxCycles, <span className="text-emerald-300">"LIMIT_REACHED"</span>);</p>
              <p className="ml-4 mt-2 opacity-50">// 3. P2P Settlement (No Escrow)</p>
              <p className="ml-4">USDC.transferFrom(subscriber, merchant, fee);</p>
              <p>{"}"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── S4: Builder ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="3"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — violet */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(139,92,246,0.15) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <p
            data-animate
            className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400/80"
          >
            The Builder
          </p>

          <h2
            data-animate
            data-delay="100"
            className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.0] tracking-tight text-transparent"
          >
            One iPhone.
            <br />
            One Student.
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent text-[clamp(2rem,4.5vw,4rem)]">
              Absolute Execution.
            </span>
          </h2>

          {/* Quote block - Thinner borders, sleeker look */}
          <div
            data-animate
            data-delay="300"
            className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/[0.05] bg-white/[0.02] p-8 shadow-2xl backdrop-blur-md"
          >
            <p className="text-base font-light leading-relaxed text-white/60 sm:text-lg italic">
              &ldquo;Built entirely on an iPhone by a{" "}
              <span className="text-white/90 font-medium not-italic">
                19-year-old solo BBA student
              </span>{" "}
              using AI-augmented development. Non-technical founder. No CS
              degree. No team. A production-grade Web3 protocol shipped in
              weeks.&rdquo;
            </p>
          </div>

          {/* Stat row */}
          <div
            data-animate
            data-delay="500"
            className="mt-12 flex flex-wrap justify-center gap-8 sm:gap-16"
          >
            {[
              { value: "1",      label: "Developer"         },
              { value: "100%",   label: "AI-Augmented"      },
              { value: "0",      label: "VC Backing (yet)"  },
              { value: "∞",      label: "Conviction"        },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-2">
                <span className="text-4xl font-bold text-white/90 tabular-nums sm:text-5xl tracking-tight">
                  {s.value}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S5: The Ask ───────────────────────────────────────────────────── */}
      <section
        data-slide-index="4"
        className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16"
        style={{ scrollSnapAlign: "start" }}
      >
        {/* Glow — amber */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "600px",
            background:
              "radial-gradient(ellipse at center, rgba(251,191,36,0.1) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <p
            data-animate
            className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400/80"
          >
            The Ask
          </p>

          {/* Big number */}
          <div data-animate data-delay="100">
            <span className="block bg-gradient-to-b from-amber-200 via-amber-300 to-amber-500/60 bg-clip-text text-[clamp(4.5rem,14vw,12rem)] font-bold leading-none tracking-tighter text-transparent drop-shadow-2xl">
              $10k
            </span>
            <p className="mt-4 text-sm font-semibold tracking-widest uppercase text-white/40 sm:text-base">
              Seed Round <span className="mx-2 opacity-50">•</span> Pre-Revenue <span className="mx-2 opacity-50">•</span> Pre-Audit
            </p>
          </div>

          {/* Use of funds */}
          <div
            data-animate
            data-delay="300"
            className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-2"
          >
            {[
              {
                pct: "70%",
                title: "ScaleBit Tier-1 Audit",
                body: "Institutional-grade smart contract security review. Essential for mainnet deployment.",
                accent: "border-amber-400/20 bg-amber-500/[0.05]",
                label: "text-amber-400",
              },
              {
                pct: "30%",
                title: "Legal Incorporation",
                body: "Delaware C-Corp / Wyoming DAO LLC. Protects protocol IP and enables VC term sheets.",
                accent: "border-white/[0.07] bg-white/[0.02]",
                label: "text-white/80",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-2xl border ${item.accent} p-6 text-left backdrop-blur-sm`}
              >
                <span
                  className={`text-3xl font-bold tabular-nums tracking-tight ${item.label}`}
                >
                  {item.pct}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-white/90">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-white/40">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div
            data-animate
            data-delay="500"
            className="mt-14 flex flex-col items-center gap-4"
          >
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">
              Angel introductions welcome
            </p>
            <a
              href="mailto:rawatdaksh179@gmail.com"
              className="group inline-flex min-h-[52px] items-center gap-3 rounded-full bg-white px-8 text-sm font-bold text-black transition-all hover:bg-neutral-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Contact Founder
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Navigation dots ──────────────────────────────────────────────── */}
      <nav
        aria-label="Slide navigation"
        className="fixed right-5 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-4 sm:right-8"
      >
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Go to ${slide.label}`}
            onClick={() => goTo(i)}
            className={[
              "rounded-full transition-all duration-300 focus:outline-none",
              i === current
                ? "h-8 w-1.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                : "h-1.5 w-1.5 bg-white/20 hover:bg-white/60 hover:scale-150",
            ].join(" ")}
          />
        ))}
      </nav>

      {/* ── Slide counter ─────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="fixed bottom-6 left-6 z-50 flex items-baseline gap-1 tabular-nums sm:bottom-8 sm:left-8 pointer-events-none"
      >
        <span className="text-2xl font-bold leading-none text-white/80 tracking-tighter">
          {String(current + 1).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium leading-none text-white/20">
          /{String(SLIDES.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
