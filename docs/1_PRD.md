# SubSmart V2.0 — Product Requirements Document (PRD)

**Document version:** 1.0
**Status:** Approved baseline for engineering
**Owner:** Product / Protocol Architecture
**Last updated:** 2026-04-28

---

## 1. Executive Summary

SubSmart V2.0 is a **decentralized, non-custodial recurring billing protocol** purpose-built for **Web3 SaaS, on-chain services, and DAO operating expenses** on the **Polygon (PoS)** network, with future portability to any EVM L2.

The protocol's core innovation is **zero-friction auto-settlement**: after a single onboarding action, customers never have to sign another transaction to pay their recurring bill. SubSmart achieves this by combining:

1. **EIP-2612 Permit signatures** for gas-less, off-chain ERC-20 approvals.
2. **Bounded, time-decaying allowances** (per-period spending caps) instead of unsafe infinite approvals.
3. **Decentralized meta-transaction execution via Gelato Network** relayers, which trigger settlement on the merchant's behalf without requiring the customer to be online.

Funds **never** touch a SubSmart-controlled wallet. Settlements move stablecoins (USDC, USDT, DAI) **directly from the customer's wallet to the merchant's wallet** through the SubSmart `BillingHub` smart contract, which acts only as an authorized, rules-enforcing escrow router — not a custodian.

---

## 2. Problem Statement

### 2.1 The on-chain churn problem

Every Web3 SaaS, infrastructure provider (RPC nodes, indexers, oracle endpoints), and DAO subscription product today faces the same operational reality:

- Recurring revenue requires the **customer to be online and to manually sign** a transaction every billing cycle.
- Wallet pop-ups, gas estimation failures, and forgotten renewals create dropout.
- Internal benchmarks across three Web3 infrastructure providers we interviewed (Q1 2026) show **~40% involuntary churn at the renewal moment** — not because the customer wants to leave, but because they simply did not sign in time.
- The two existing "solutions" both have unacceptable trade-offs:
  1. **Infinite ERC-20 approval** (`approve(spender, type(uint256).max)`) — exposes the user to total drain if the spender contract is exploited or upgraded maliciously.
  2. **Custodial top-up wallets** — re-introduces the centralized intermediary the user came to Web3 to avoid, and is increasingly subject to MTL / VASP regulation.

### 2.2 What success looks like

A merchant publishes a subscription plan on-chain. A customer subscribes **once**, signing **one EIP-712 permit** that authorizes a **strictly bounded** allowance (e.g. "up to 25 USDC every 30 days, for at most 12 cycles"). From that moment forward, the merchant — or any decentralized relayer — can pull the exact agreed amount on schedule, with zero further interaction from the customer, and zero possibility of overpayment, early payment, or post-cancellation payment.

---

## 3. Goals & Non-Goals

### 3.1 Goals (V2.0 scope)

| # | Goal | Measurable target |
|---|---|---|
| G1 | Eliminate manual signing at every billing cycle | 1 signature for entire subscription lifetime |
| G2 | Reduce involuntary renewal churn | ≥ 70% reduction vs. manual-sign baseline |
| G3 | Keep funds non-custodial at all times | 0 protocol-controlled treasury balances |
| G4 | Eliminate infinite-approval risk surface | Per-period capped allowance, hard-revocable |
| G5 | Predictable settlement gas for merchants | Gelato fee paid in subscription token, capped per cycle |
| G6 | Cancel-anytime UX | On-chain `cancel()` callable by customer at any time, takes effect immediately |

### 3.2 Non-goals (V2.0 explicitly out of scope)

- Fiat on/off ramping.
- Native token (MATIC/ETH) recurring payments — V2.0 supports **only ERC-20s with EIP-2612 Permit support**. Wrapped MATIC and major stablecoins on Polygon already qualify.
- Cross-chain billing (deferred to V3 with LayerZero/CCIP).
- Free trials with credit-card-style pre-auth holds.
- Usage-based / metered billing (V2.0 is fixed-cycle, fixed-amount).

---

## 4. Target Audience & Personas

### 4.1 Primary segments

1. **Web3 SaaS providers** — RPC providers, subgraph indexers, on-chain analytics dashboards, NFT-gated APIs, AI inference credit sellers, security monitoring tools.
2. **DAOs with recurring vendor obligations** — contributor stipends, service-level retainers (auditors, designers, legal), tooling subscriptions paid out of the DAO treasury.
3. **Creator / community platforms** — token-gated newsletters, paid Discord/Telegram cohorts, on-chain Patreon-style memberships.

### 4.2 Personas

#### Persona A — "Maya, Web3 SaaS founder"
- Runs a Polygon-based RPC product, ~3,200 paying wallets.
- Loses ~40% of monthly revenue to renewal-moment dropoff.
- Needs: predictable MRR, zero-touch billing, no compliance burden of holding customer funds.
- KPI she cares about: **net revenue retention**.

#### Persona B — "DAO-Treasury-Multisig"
- A 5-of-9 Safe controlling a DAO operating budget.
- Pays 14 vendors monthly. Each payment currently requires a multisig ceremony.
- Needs: pre-authorized, bounded, cancel-anytime outflows that respect governance limits.
- KPI: **operational overhead reduction**, **on-chain auditability of every cent**.

#### Persona C — "Devon, end-customer"
- Holds USDC on Polygon, uses MetaMask + a hardware wallet.
- Has been burned once by an infinite approval exploit.
- Needs: a subscription he can trust to never overcharge, never drain his wallet, and that he can kill instantly.
- KPI: **peace of mind**, transparent on-chain proof of every charge.

---

## 5. Core User Flows

### 5.1 Merchant flow — "Create a billing plan"

1. **Connect wallet** — Merchant connects via wagmi (MetaMask, WalletConnect, Coinbase, Safe).
2. **Choose network** — Polygon Mainnet (default) or Polygon Amoy (testnet).
3. **Define plan** — Form captures:
   - Plan name & external metadata URI (IPFS).
   - Billing token (ERC-20 with Permit; UI filters to compliant tokens).
   - Amount per cycle (e.g. `25.00 USDC`).
   - Cycle length (`7 / 14 / 30 / 90` days, or custom seconds).
   - Maximum number of cycles (`0` = open-ended, but customer can still cancel).
   - Receiving wallet (defaults to connected merchant address; can be a Safe).
4. **Sign `createPlan` transaction** — Single on-chain write to `BillingHub.createPlan(...)`. Returns a `planId` (deterministic from plan params + merchant address + nonce).
5. **Receive shareable subscribe link** — `app.subsmart.xyz/subscribe/<planId>`.
6. **Dashboard** — Merchant sees: active subscribers, MRR projection, settlement history, failed-charge log, churn analytics.

### 5.2 Customer flow — "Subscribe with zero recurring friction"

1. **Land on subscribe link** — Plan card renders amount, cycle length, total commitment, and the **exact bounded allowance** that will be authorized.
2. **Connect wallet** — wagmi modal (MetaMask, WalletConnect, etc.).
3. **Pre-flight checks** — UI verifies:
   - Token balance is sufficient for at least the first cycle.
   - Token implements EIP-2612 (`DOMAIN_SEPARATOR()`, `permit()`, `nonces()`).
   - Network is correct (auto-prompt switch to Polygon).
4. **Single signature — the only one ever required**:
   - The user signs **two off-chain EIP-712 messages bundled into one wallet prompt** (where the wallet supports it) or two sequential prompts otherwise:
     - **a) EIP-2612 Permit** authorizing the `BillingHub` to pull `amountPerCycle * maxCycles` *bounded by an expiry deadline*.
     - **b) SubSmart subscription intent** (`Subscribe(planId, customer, startTime, maxCycles, deadline, nonce)`).
5. **First charge & subscription activation** — A Gelato relayer (or anyone permissionless) calls `BillingHub.subscribeWithPermit(...)`, which:
   - Verifies both signatures.
   - Calls `IERC20Permit.permit(...)` to set the bounded allowance.
   - Executes the **first** `transferFrom(customer, merchant, amount)`.
   - Emits `Subscribed(planId, customer, ...)`.
6. **Auto-settlement, every cycle, forever (or until cancel)** — When `block.timestamp >= subscription.nextChargeAt`, *anyone* — Gelato by default — can call `BillingHub.charge(subscriptionId)`, which pulls the exact agreed amount. The customer is offline. No signature. No pop-up. No drama.
7. **Cancel anytime** — Customer signs one transaction: `BillingHub.cancel(subscriptionId)`. Effective immediately. No further charges possible. The remaining permit allowance is rendered un-spendable by the contract regardless of what the underlying ERC-20 still permits.
8. **Receipts** — Every charge emits a `Charged` event indexed by customer + merchant; the dApp surfaces them as on-chain receipts with block explorer links.

### 5.3 Failed-charge flow

- If a `charge()` call reverts (insufficient balance, revoked permit, paused token), `ChargeFailed` is emitted.
- The subscription enters a **grace period** (configurable per plan, default 72h).
- Gelato retries on a back-off schedule (1h, 6h, 24h).
- If still failing after grace, subscription auto-transitions to `LAPSED` and stops retrying. The customer can `resume()` with one click (a fresh permit signature).

---

## 6. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Merchant can create, pause, and archive billing plans on-chain | Must |
| FR-2 | Customer can subscribe with exactly one signing ceremony | Must |
| FR-3 | Allowance is **bounded** by `amountPerCycle * maxCycles` and a **deadline** | Must |
| FR-4 | Settlement can be triggered by Gelato or any permissionless relayer | Must |
| FR-5 | Relayer fee is paid in the subscription token, capped per cycle (≤ 1.5% by default) | Must |
| FR-6 | Customer can cancel at any time, with immediate effect | Must |
| FR-7 | Failed charges follow a deterministic grace + retry schedule | Must |
| FR-8 | All state transitions emit indexed events for off-chain analytics | Must |
| FR-9 | Plans support metadata URIs (IPFS) for richer merchant branding | Should |
| FR-10 | Merchant dashboard surfaces MRR, churn, LTV, and failed-charge funnel | Should |
| FR-11 | Multi-sig (Safe) merchants supported as receiving address | Must |
| FR-12 | Subscription NFT (ERC-721) optionally minted to customer as proof-of-membership | Could |

---

## 7. Non-Functional Requirements

- **Security:** No infinite approvals. No upgradeable proxies in V2.0 (immutable contracts only). All external calls follow checks-effects-interactions. Reentrancy guard on every external entry point that touches token transfers.
- **Auditability:** Every state-changing function emits an indexed event. Subgraph published from day one.
- **Performance:** dApp Time-to-Interactive < 2.0s on a mid-tier mobile device on 4G. Lighthouse Performance score ≥ 90.
- **Accessibility:** WCAG 2.1 AA. All wallet-interaction modals keyboard-navigable.
- **Internationalization:** English at launch; copy externalized for future locales.
- **Observability:** Frontend telemetry (privacy-respecting) on signature funnel drop-off.

---

## 8. Success Metrics

| Metric | Baseline | Target (90 days post-launch) |
|---|---|---|
| Involuntary renewal churn | ~40% | ≤ 12% |
| Signatures per subscription lifetime | N (one per cycle) | **1** |
| Time-to-first-charge (subscribe click → first settlement confirmed) | n/a | < 30s p50 |
| Merchant onboarding time (connect → live plan) | n/a | < 3 minutes |
| Failed-charge recovery rate within grace period | n/a | ≥ 65% |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Token does not implement EIP-2612 | UI hard-blocks selection; show curated allow-list of Permit-compliant tokens on Polygon |
| Customer revokes allowance directly on the token contract | Detected on next `charge()`; subscription auto-lapses gracefully |
| Gelato outage | Permissionless `charge()` — anyone can earn the relayer fee; merchant can self-relay |
| Stablecoin de-peg / freeze (e.g. USDC blacklist) | Per-token risk disclosure on subscribe page; merchant can offer multiple tokens per plan |
| Phishing clones of the dApp | ENS + content-hash, signed release manifest, prominent contract address verification UI |

---

## 10. Open Questions (to resolve before contract implementation)

1. Should the relayer fee cap be a global protocol parameter or per-plan?
2. Do we mint a subscription NFT by default in V2.0, or gate behind a merchant toggle?
3. Should `cancel()` be callable by the merchant as well (e.g. for ToS violations), and if so under what on-chain proof?
4. Do we need a protocol-level "panic pause" guardian (timelocked, revocable) for the first 6 months post-launch?

---

**End of PRD — proceed to `2_SYSTEM_DESIGN.md` for technical architecture.**
