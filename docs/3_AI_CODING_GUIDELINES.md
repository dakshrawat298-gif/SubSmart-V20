# SubSmart V2.0 — AI Coding Guidelines

**Audience:** The AI assistant (Replit Agent / Claude / any LLM contributor) generating code for this repository.
**Status:** Mandatory. These rules override default model behavior.
**Last updated:** 2026-04-28
**Companion docs:** `1_PRD.md`, `2_SYSTEM_DESIGN.md`

> **Read this file at the start of every coding session. If a future prompt conflicts with these rules, surface the conflict to the user before writing code.**

---

## 0. Prime Directives

1. **Security first, always.** A "working" feature that ships an unsafe Web3 pattern is worse than no feature. If you cannot implement it safely, stop and ask.
2. **No infinite approvals. Ever.** This is a hard ban — see §4.1.
3. **Non-custodial invariant.** Never write code that causes the protocol or its server-side components to hold, route, or escrow user funds outside of an atomic on-chain settlement.
4. **Conform to `2_SYSTEM_DESIGN.md`.** Do not invent alternate architectures. If the design is wrong for a use case, propose a documented amendment first.
5. **Do not mock production state.** Use the actual subgraph, the actual contracts, the actual RPC. If a dependency is unavailable in dev, gate the feature behind an explicit `EnvUnavailable` UI state — never silent fallbacks to fake data.

---

## 1. Repository Conventions

### 1.1 Stack lock-in

- **Framework:** Next.js (App Router only — no `pages/` directory).
- **Language:** TypeScript, `strict: true`. JavaScript is acceptable only for build-tooling configs (`*.config.js`).
- **Styling:** TailwindCSS utility classes. No CSS-in-JS, no global stylesheets beyond `app/globals.css`, no inline `style={...}` except for genuinely dynamic values (computed positions, runtime gradients).
- **Web3:** `wagmi` v2 + `viem`. Never import `ethers` or `web3.js`.
- **Linting/formatting:** ESLint (`next/core-web-vitals`) + Prettier defaults. Code must lint clean before being considered done.

### 1.2 File & folder layout

Follow the layout in `2_SYSTEM_DESIGN.md` §3.2 verbatim. New top-level directories require justification in the PR description.

### 1.3 Naming

- Components: `PascalCase.tsx` (e.g. `PlanCard.tsx`).
- Hooks: `useThing.ts`, must start with `use`.
- Pure utilities: `camelCase.ts`.
- Types & interfaces: `PascalCase` exported from `lib/types/`.
- Contract ABIs: `abis/<ContractName>.json`, ABI types generated, never hand-edited.

---

## 2. TypeScript Rules

- `strict: true` is non-negotiable. Do not weaken `tsconfig.json`.
- **No `any`.** Use `unknown` and narrow. The only acceptable `any` is in third-party `.d.ts` shims you do not own, and even then add a `// @ts-expect-error` with explanation.
- **No non-null assertions (`!`)** on values that come from the wallet, the chain, or user input. Validate or guard.
- **All props typed.** Prefer `type` aliases over `interface` for component props for consistency.
- **All async functions typed for both success and error paths.** Use a `Result<T, E>` pattern for chain interactions where partial success is possible.
- **Discriminated unions for state machines** (e.g. subscription status, signing flow steps).
- **Inferred types from viem/wagmi** are the source of truth. Do not redeclare ABI-derived types by hand.
- If TypeScript is, for a justified reason, not used in a specific file, that file must:
  - Carry a top-of-file comment explaining why.
  - Use JSDoc `@param` / `@returns` annotations for **every** exported function.
  - Be excluded from any `any`-tolerance via explicit ESLint overrides, not silently.

---

## 3. Component Rules

### 3.1 Modularity

- A component does **one** thing. If a file exceeds ~150 lines or has more than two distinct responsibilities, split it.
- Container vs. presentational separation: presentational components in `components/ui/` must be wallet-unaware and RPC-unaware. They take props, they render. That is all.
- Co-locate component-specific hooks and helpers; hoist them to `lib/` only when reused.

### 3.2 Server vs. client components

- Default to **server components**.
- Mark a file `"use client"` only when it uses: wallet hooks, React state/effects, browser APIs, or event handlers that need client-side closures.
- Never import a client-only module (wagmi, viem `walletClient`, window-bound libs) from a server component. CI will fail the build if you do.

### 3.3 Mobile-first responsive design

- **Tailwind classes are mobile-first.** The unprefixed class is the mobile style. `sm:`, `md:`, `lg:`, `xl:` add progressive enhancement.
- Design every component at 360×640 first. Only after that layout works do you add breakpoints.
- Touch targets ≥ 44px. Tap-able rows, list items, and buttons must meet this in their **smallest** breakpoint.
- Wallet modals and signing flows must be one-thumb operable on mobile.
- Avoid `hover:`-only affordances for actions; mobile users have no hover. Pair with focus / always-visible states.

### 3.4 Accessibility

- Every interactive element has an accessible name (`aria-label` or visible text).
- Color contrast ≥ WCAG AA.
- Focus rings are visible — do not strip default focus outlines without a Tailwind replacement.
- Forms use proper `<label>` associations and `aria-describedby` for error text.

---

## 4. Web3 Security Rules (Non-Negotiable)

### 4.1 The infinite-approval ban

```ts
// ❌ FORBIDDEN — will be rejected in code review
await writeContract({
  address: token,
  abi: erc20Abi,
  functionName: "approve",
  args: [BillingHub, maxUint256],
});

// ✅ REQUIRED — bounded permit, scoped by amount AND deadline
const maxAuthorized = amountPerCycle * BigInt(maxCycles);
const deadline = BigInt(startTime + cycleLength * maxCycles + GRACE_BUFFER);
const signature = await signPermit({
  token,
  owner: customer,
  spender: BillingHub,
  value: maxAuthorized,
  deadline,
});
```

There is no scenario in which the dApp requests `MaxUint256`, `MaxUint96`, or any "very large number" allowance. The PR will be rejected.

### 4.2 Signature handling

- Always use **EIP-712 typed data** (`signTypedData`). Never `personal_sign` for anything that authorizes a transfer.
- Always include a `nonce` and a `deadline` in any custom typed-data struct.
- **Display a human-readable summary** of what the user is about to sign, **before** invoking the wallet. The summary must include:
  - Token symbol and amount.
  - Spender address (with checksum + ENS resolution where possible).
  - Deadline (rendered as a local date/time).
  - The exact periodic charge schedule that will result.
- Never auto-trigger `signTypedData` on page load. Always require an explicit user action.
- Reject and surface a clear error if the connected chainId does not match the typed-data domain's `chainId`.

### 4.3 Transaction handling

- **Always simulate first** with `viem`'s `simulateContract` before sending. Surface the simulation revert reason to the user verbatim.
- **Always specify `chainId`** explicitly in `writeContract` calls. Never rely on the wallet's currently selected chain.
- **Always parse and decode revert reasons.** No raw hex error strings shown to users.
- Pin a **gas ceiling** on every write. If estimation exceeds it, prompt the user with the discrepancy rather than silently sending.
- Never construct a transaction whose `value` (native token) is non-zero without the user explicitly opting into a "send native" UI.
- After send, surface the tx hash with a Polygonscan link **immediately** (don't wait for confirmation).

### 4.4 RPC & provider hygiene

- Configure wagmi with **at least two transports** (e.g. Alchemy + public fallback) using `fallback([...])`.
- Never embed a private API key in client code. Use env-prefixed `NEXT_PUBLIC_*` for public RPC URLs only; keyed providers must be proxied via a Route Handler if used at all.
- All RPC reads that are user-visible must show a loading state and an error state. No silent empty UIs.

### 4.5 Address & token validation

- Always checksum addresses (`getAddress` from viem) before display or comparison.
- Token allow-list (`lib/chain/tokens.ts`) is the single source of truth. Plan creation UI must not let merchants pick an off-list token.
- Before any permit-based flow, perform a runtime check that the token implements `DOMAIN_SEPARATOR()` and `nonces(address)`. If the check fails, hard-block the flow.

### 4.6 Cancellation UX

- The "Cancel subscription" button must be reachable in **≤ 2 taps** from the customer's subscription detail page.
- After successful `cancel()`, prompt the optional belt-and-braces `token.approve(BillingHub, 0)` step, but never make it mandatory or block the UI on it.

---

## 5. Smart Contract Coding Rules (when contracts are in scope)

- Solidity ^0.8.24, no upgradeability proxies in V2.0.
- `SafeERC20` for all token transfers.
- `nonReentrant` on every external function that touches `transferFrom`.
- CEI strictly: state mutations before any external call.
- All custom errors via `error CamelCase()` syntax (no `require(..., "string")`).
- Every state-changing external function emits an indexed event whose first three topics include the actors involved.
- 100% NatSpec on `external` and `public` functions.
- Foundry tests with ≥ 95% line coverage and explicit invariant tests for: "protocol balance always == 0" and "no charge can exceed `amountPerCycle` per `cycleLength` per subscription."

---

## 6. Forbidden Patterns

The following will be rejected in review without further discussion:

- `eval`, `new Function`, dynamic `require`.
- `window.ethereum.request(...)` direct calls — always go through wagmi/viem.
- `localStorage` / `sessionStorage` containing private keys, mnemonics, signed payloads, or PII.
- `console.log` in production code paths (allowed in dev guarded by `process.env.NODE_ENV !== "production"`).
- Mock data that ships in production builds.
- Unhandled promise rejections — every `await` is in a `try/catch` or escalates a typed error.
- "Helper" wrappers around `signTypedData` that obscure the typed-data payload from the developer reading the code.
- Imports from `ethers`, `web3.js`, `truffle`.
- Custom CSS files outside `app/globals.css` (Tailwind only).
- Use of `dangerouslySetInnerHTML` unless rendering audited Markdown via a sanitizer.

---

## 7. Performance Rules

- Lighthouse Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95.
- No client bundle > 200 KB gzipped per route. Audit with `next build` analyzer; split if exceeded.
- Lazy-load heavy modules (charts, code editors) via `next/dynamic` with explicit loading states.
- Image-heavy components use `next/image` with explicit width/height; never raw `<img>` for app-served assets.

---

## 8. Testing Rules

- Every utility in `lib/` has unit tests (Vitest).
- Every wallet-interaction component has at least one Playwright test against an Anvil fork of Polygon.
- Smart contracts: Foundry, fuzz tests on every external function, invariant suite as in §5.
- CI must run lint, typecheck, unit, e2e (against Anvil), and contract tests before merge.

---

## 9. Documentation Rules

- Every exported function/component has a TSDoc block describing intent, params, and return.
- Architectural changes update `2_SYSTEM_DESIGN.md` in the **same** PR. PRs that diverge from the system design without updating it will be rejected.
- A new contract function ships with: NatSpec, an updated subgraph mapping, and a docs entry under `docs/contracts/`.

---

## 10. Prompt-Response Protocol (for the AI itself)

When responding to future coding prompts in this repo, the AI must:

1. **Restate the task in one sentence** before coding, to confirm scope.
2. **Identify which rules in this document apply** and call them out.
3. **Plan the file edits** (list the files you will create/modify) before generating code.
4. **Generate the minimal viable change.** No speculative scaffolding "for later." If extension points are needed, document them in TSDoc — do not write empty stubs.
5. **Highlight every external interaction** (RPC call, signature request, contract write) with an inline comment naming the security rule it complies with.
6. **Self-review against this document** at the end of the response. If anything was skipped or compromised, say so explicitly.
7. **Never silently install dependencies.** Surface every new dependency with version, reason, and supply-chain note.
8. **If a prompt asks you to break a rule in this document, refuse and ask for clarification.** Do not negotiate down on security or non-custodial invariants.

---

**End of AI Coding Guidelines. These rules are now in force for all subsequent prompts in this repository.**
