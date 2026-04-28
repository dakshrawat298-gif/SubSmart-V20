# SubSmart V2.0 — System Design Document

**Document version:** 1.0
**Status:** Architecture baseline — engineering must conform
**Owner:** Protocol Architecture
**Last updated:** 2026-04-28
**Companion docs:** `1_PRD.md`, `3_AI_CODING_GUIDELINES.md`

---

## 1. Architectural Principles

These principles are non-negotiable. Every design and implementation decision is judged against them.

1. **Non-custodial by construction.** The protocol contracts must never hold user funds at rest. Tokens move atomically from customer to merchant in a single transaction.
2. **Bounded authority.** A subscription must never authorize more than it strictly needs. Allowances are scoped by amount, cycle count, and deadline.
3. **Immutable core.** The settlement contracts deployed in V2.0 are non-upgradeable. New behavior ships as new contract versions, opted into by new plans only.
4. **Permissionless settlement.** Anyone may trigger a due charge. Gelato is the *default* relayer, not a privileged one.
5. **Deterministic & event-driven.** Every state transition is emitted as an indexed event. The off-chain stack derives state from events, never from RPC polling of contract storage.
6. **Defense in depth.** Reentrancy guards, checks-effects-interactions, EIP-712 typed signatures, replay nonces, and pause-aware ERC-20 handling are all mandatory — not opt-in.

---

## 2. High-Level Architecture

```
                         ┌─────────────────────────────────────────┐
                         │          Customer / Merchant Wallet     │
                         │   (MetaMask · WalletConnect · Safe)     │
                         └───────────────┬─────────────────────────┘
                                         │ EIP-712 sigs · tx
                                         ▼
┌──────────────────────────┐   wagmi/viem    ┌────────────────────────────┐
│  Next.js App Router dApp │◄───────────────►│   Polygon RPC (Alchemy/    │
│  TailwindCSS · TypeScript│                 │   Infura · public fallback)│
└──────────┬───────────────┘                 └──────────────┬─────────────┘
           │ GraphQL                                        │
           ▼                                                ▼
┌──────────────────────────┐                 ┌────────────────────────────┐
│   The Graph Subgraph     │◄────indexes─────│  SubSmart Smart Contracts  │
│  (plans, subs, charges)  │                 │  • BillingHub (core)       │
└──────────┬───────────────┘                 │  • PlanRegistry            │
           │                                 │  • SubscriptionNFT (opt.)  │
           ▼                                 └──────────────┬─────────────┘
┌──────────────────────────┐                                │
│ Merchant Analytics API   │                                │ events
│ (Next.js Route Handlers, │                                ▼
│ read-only, cache layer)  │                 ┌────────────────────────────┐
└──────────────────────────┘                 │  Gelato Network Relayers   │
                                             │  (auto-call charge() at    │
                                             │   nextChargeAt timestamp)  │
                                             └────────────────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Framework choices

| Layer | Choice | Rationale |
|---|---|---|
| Meta-framework | **Next.js 14+ (App Router)** | Server components for SEO of public plan pages; route handlers for cached read APIs; edge-friendly. |
| Styling | **TailwindCSS** | Utility-first, mobile-first by default, zero runtime CSS-in-JS overhead. |
| Language | **TypeScript (strict)** | Type-safe ABI inference via viem; eliminates an entire class of Web3 bugs. |
| State (UI) | **React Server Components + Zustand for client state** | Minimize client JS; localized stores per feature. |
| State (chain) | **wagmi v2 + viem** | Type-safe, tree-shakable, official replacement for ethers.js for app-layer reads/writes. |
| Wallet UX | **RainbowKit or ConnectKit (TBD)** + wagmi connectors | Multi-wallet, Safe-aware, mobile-first. |
| Data fetching | **TanStack Query (via wagmi)** | Cache + retry + dedupe for RPC calls. |
| Indexing | **The Graph (hosted subgraph)** | Source of truth for historical/aggregate views (MRR, churn). |
| Forms | **React Hook Form + Zod** | Type-inferred validation that matches contract input types. |
| Testing | **Vitest + Playwright** | Unit + e2e including a forked-Polygon Anvil for wallet flows. |

### 3.2 App Router layout

```
app/
├─ layout.tsx                  # Root layout, providers (wagmi, query, theme)
├─ page.tsx                    # Marketing landing
├─ (merchant)/
│  ├─ dashboard/
│  │  ├─ page.tsx              # MRR, churn, recent charges
│  │  ├─ plans/
│  │  │  ├─ page.tsx           # List plans
│  │  │  ├─ new/page.tsx       # Create plan wizard
│  │  │  └─ [planId]/page.tsx  # Plan detail + subscribers
│  │  └─ settings/page.tsx
├─ (customer)/
│  ├─ subscribe/[planId]/page.tsx     # Public subscribe page (SSR for SEO)
│  ├─ subscriptions/page.tsx          # My subscriptions (wallet-scoped)
│  └─ subscriptions/[id]/page.tsx     # Detail, cancel, history
├─ api/
│  ├─ plans/[planId]/route.ts         # Cached read of plan metadata
│  └─ health/route.ts
components/
├─ web3/
│  ├─ ConnectButton.tsx
│  ├─ NetworkGate.tsx           # Forces Polygon
│  ├─ TokenBalance.tsx
│  ├─ PermitSigner.tsx          # Encapsulates EIP-2612 signing
│  └─ TransactionToast.tsx
├─ billing/
│  ├─ PlanCard.tsx
│  ├─ AllowanceDisclosure.tsx   # MUST render the exact bounded scope
│  └─ ChargeHistoryTable.tsx
├─ ui/                          # Pure presentational, mobile-first
lib/
├─ chain/
│  ├─ wagmi.ts                  # wagmi config, transports, connectors
│  ├─ contracts.ts              # Typed contract instances (viem getContract)
│  ├─ permit.ts                 # EIP-712 typed-data builders
│  └─ tokens.ts                 # Permit-compliant token allow-list
├─ subgraph/
│  ├─ client.ts
│  └─ queries.ts                # Type-generated GraphQL
├─ types/
│  └─ billing.ts                # Shared domain types
```

### 3.3 Server vs. client components — the rule

- **Server components by default.** Public pages (landing, `/subscribe/[planId]`) are RSC for SEO and TTFB.
- **Client components only when one of the following is true:** uses a wallet, uses React state/effects, or subscribes to wagmi hooks. These files must declare `"use client"` at the top and be as small as possible.
- **No mixing.** Never import a client-only library (wagmi, viem walletClient) into a server component.

### 3.4 Mobile-first responsive design

- Default layout assumes a 360px viewport.
- All Tailwind class strings are written **mobile-first**: base classes target mobile; `sm:`, `md:`, `lg:` are *progressive enhancements only*.
- Wallet modals must be reachable and dismissable with a single thumb on a 360x640 device.
- Touch targets ≥ 44×44 CSS pixels.

---

## 4. Smart Contract Architecture

### 4.1 Contracts

| Contract | Responsibility | Upgradeable? |
|---|---|---|
| `PlanRegistry` | Stores immutable plan definitions. Emits `PlanCreated`, `PlanArchived`, `PlanPaused`. | No |
| `BillingHub` | Core. Handles `subscribeWithPermit`, `charge`, `cancel`, `resume`. Holds **no funds**. | No |
| `RelayerFeeRouter` | Computes and forwards the capped relayer fee in the subscription token. | No |
| `SubscriptionNFT` *(optional, per plan)* | ERC-721 minted on subscribe; burned on cancel/lapse. Pure membership artifact, no economic rights. | No |

All four are deployed once per chain, immutable. New protocol behavior ⇒ new versioned deployment, plans on the old version continue to settle.

### 4.2 Bounded approval — the security keystone

The dApp **must never** request `approve(spender, type(uint256).max)`. Instead:

1. We compute the *maximum lifetime authorization*:
   ```
   maxAuthorized = amountPerCycle * maxCycles
   permitDeadline = startTime + (cycleLength * maxCycles) + GRACE_BUFFER
   ```
2. We collect an **EIP-2612 Permit** signature with `value = maxAuthorized` and `deadline = permitDeadline`.
3. The `BillingHub` calls `IERC20Permit.permit(...)` itself (no separate `approve` tx).
4. On every `charge()`, the contract enforces an **independent in-protocol allowance ledger** that decrements by `amountPerCycle` per cycle. Even if the underlying ERC-20 still has approval headroom, the protocol will refuse to pull more than `amountPerCycle` per `cycleLength` window per subscription.

This gives **two independent ceilings** (the ERC-20 allowance *and* the protocol's own per-cycle accounting). A bug in either layer alone cannot drain the user.

### 4.3 Why we explicitly reject infinite approval

- A single exploit in any spender contract that holds `MAX_UINT256` allowance drains the wallet completely.
- Bounded approvals limit blast radius to **at most one cycle's worth** of tokens, even in the worst-case compromise.
- Bounded approvals naturally **expire**, so dormant subscriptions don't leave permanent attack surface on the user's wallet.

### 4.4 Cancellation semantics

`cancel(subscriptionId)`:

1. Sets `status = CANCELLED` (CEI: state first).
2. Zeroes the protocol-side per-cycle ledger for this subscription.
3. Emits `Cancelled(subscriptionId, customer, block.timestamp)`.
4. **Does not** call `permit(...)` to zero the underlying allowance (would require a fresh customer signature). The protocol-level guard is sufficient because all settlement flows route through `BillingHub`, which checks status before transferring.
5. Frontend prompts the user to additionally call `token.approve(BillingHub, 0)` as a belt-and-braces step. This is optional and clearly labelled.

### 4.5 Settlement function — invariants

`charge(subscriptionId)` must enforce, in this order:

1. `status == ACTIVE`.
2. `block.timestamp >= subscription.nextChargeAt`.
3. `subscription.cyclesCharged < subscription.maxCycles` (if `maxCycles != 0`).
4. Plan is not paused or archived.
5. Token is not on the protocol's emergency deny-list.
6. Compute `relayerFee = min(amountPerCycle * feeBps / 10_000, FEE_CAP)`.
7. Update state: `nextChargeAt += cycleLength`, `cyclesCharged++`.
8. `IERC20.transferFrom(customer, merchant, amountPerCycle - relayerFee)`.
9. `IERC20.transferFrom(customer, msg.sender, relayerFee)`.
10. `emit Charged(...)`.

`nonReentrant` modifier on the entire function. All external calls happen *after* state updates.

### 4.6 Decentralized relayer layer (Gelato + permissionless fallback)

- **Default path:** Gelato Network's "Web3 Functions" cron is configured per subscription to call `charge(subscriptionId)` at `nextChargeAt`. Gelato is paid the on-chain `relayerFee` automatically.
- **Permissionless fallback:** `charge()` is `external` and unrestricted. If Gelato is down, *anyone* — the merchant, the customer, an MEV searcher, a community keeper — can call it and earn the same fee. There is no privileged relayer.
- **Front-running is harmless:** the function is idempotent in effect (only one party can pull per cycle window) and the recipient (merchant) is fixed in storage. Whoever lands the tx first earns the fee.

---

## 5. Off-Chain Components

### 5.1 Subgraph

- Indexes: `PlanCreated`, `PlanPaused`, `PlanArchived`, `Subscribed`, `Charged`, `ChargeFailed`, `Cancelled`, `Lapsed`, `Resumed`.
- Entities: `Plan`, `Subscription`, `Charge`, `Merchant`, `Customer`, `DailyMRRSnapshot`.
- Hosted on The Graph's decentralized network (with a hosted-service fallback during early launch).

### 5.2 Next.js Route Handlers (read-only)

- `GET /api/plans/:id` — cached (Edge, `revalidate = 60`) plan metadata.
- `GET /api/health` — protocol heartbeat: latest indexed block, RPC status, Gelato task health.
- **No write endpoints exist on the server.** All writes are signed client-side and sent directly to the chain. The Next.js server has no signing keys.

### 5.3 Telemetry

- Privacy-respecting analytics (e.g. Plausible/PostHog self-hosted) on the signing funnel only.
- No wallet addresses sent to telemetry. Page-level events only.

---

## 6. Network & Token Support

- **V2.0 chain:** Polygon Mainnet (chainId 137). Polygon Amoy (80002) for testing.
- **Tokens (launch allow-list):** USDC.e, USDC (native), USDT, DAI, FRAX — all verified to implement EIP-2612 on Polygon.
- **Token onboarding:** new tokens are added to the allow-list only after a programmatic check confirms `permit()`, `nonces()`, and `DOMAIN_SEPARATOR()` behave per EIP-2612 and survive a fork-test against historical exploits (e.g. permit signature malleability).

---

## 7. Security Model

### 7.1 Threat model summary

| Threat | Mitigation |
|---|---|
| Infinite-approval drain | Bounded permits + protocol-side per-cycle ledger |
| Reentrancy on `transferFrom` | `nonReentrant`, CEI ordering |
| Signature replay | EIP-712 domain separator + per-customer nonce |
| Front-end phishing / DNS hijack | ENS + IPFS content hash; verified contract address banner |
| Malicious upgrade | Contracts are non-upgradeable |
| Token blacklist (USDC freeze) | `ChargeFailed` path; auto-lapse; multi-token plans |
| Gelato compromise / outage | Permissionless `charge()` |
| Griefing via spam `charge()` calls | `nextChargeAt` window enforcement; reverts before any state change |

### 7.2 Audit policy

- Two independent audits before mainnet (one specializing in EIP-712/permit edge cases).
- Continuous fork-fuzzing in CI against latest Polygon state.
- 30-day public bug bounty (Immunefi) before TVL-permitting promotion.

---

## 8. Deployment & Environments

| Environment | Chain | Purpose | Vercel/Replit URL pattern |
|---|---|---|---|
| local | Anvil fork of Polygon | Dev | `localhost` (proxied via Replit) |
| preview | Polygon Amoy | PR previews | `*-subsmart.replit.app` |
| staging | Polygon Mainnet (separate plans, throwaway treasury) | Pre-prod sanity | `staging.subsmart.xyz` |
| prod | Polygon Mainnet | Live | `app.subsmart.xyz` (ENS + IPFS) |

---

## 9. Observability

- **Frontend:** Sentry-compatible error reporting, scrubbed of any signature payloads.
- **Chain:** Subgraph health monitor, Gelato task dashboards exported to Grafana.
- **SLOs:** Subscribe-page TTI < 2.0s p75; `charge()` success rate ≥ 99% inside grace window; subgraph lag < 30 blocks.

---

## 10. Glossary

- **Permit (EIP-2612):** An off-chain signed message that, when submitted on-chain, sets an ERC-20 allowance without a separate `approve` transaction.
- **Bounded allowance:** An allowance scoped by both a finite token amount *and* a `deadline` timestamp.
- **Relayer:** Any address that submits a meta-transaction (here: `charge()`) on behalf of someone else, in exchange for a fee.
- **Gelato Web3 Functions:** A decentralized cron / automation network that triggers smart-contract calls at scheduled times.
- **CEI:** Checks-Effects-Interactions, the canonical Solidity pattern to prevent reentrancy.

---

**End of System Design — proceed to `3_AI_CODING_GUIDELINES.md`.**
