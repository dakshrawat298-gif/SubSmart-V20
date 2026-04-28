# SubSmart V2.0

A decentralized, non-custodial recurring billing protocol for Web3 SaaS on Polygon.

## Project status

Phase 6 in progress — frontend ↔ smart-contract integration. Architecture and product documentation lives under [`docs/`](./docs):

- [`docs/1_PRD.md`](./docs/1_PRD.md) — Product Requirements Document
- [`docs/2_SYSTEM_DESIGN.md`](./docs/2_SYSTEM_DESIGN.md) — Technical architecture
- [`docs/3_AI_CODING_GUIDELINES.md`](./docs/3_AI_CODING_GUIDELINES.md) — Mandatory rules for AI-assisted contributions

Completed:

- Phases 1–5: `BillingHub.sol` ships protocol fees, `cancel(bytes32)`, `Cancelled` event, subscription locator, plus 38/38 unit tests + 3/3 invariants and 100% line/branch coverage.
- Phase 6 (this milestone): Merchant Dashboard at `/merchant` wired through wagmi v2 — token allow-list, simulate-first, explicit chainId, decoded reverts, immediate Polygonscan link.

## Stack

- Next.js 14 (App Router)
- TailwindCSS 3
- TypeScript (strict)
- wagmi v2 + viem (no ethers)
- Planned: The Graph, Gelato Network

## On-chain configuration

Set per-chain `BillingHub` deployment addresses via public env vars before
the merchant dashboard can publish plans (the UI shows an explicit
"missing-deployment" state when unset, per AI guidelines §0.5):

```bash
NEXT_PUBLIC_BILLING_HUB_ADDRESS_POLYGON=0x...
NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY=0x...
```

The contract ABI lives at `lib/chain/abis/BillingHub.json`, regenerated from
`contracts/out/BillingHub.sol/BillingHub.json` after each Foundry build.

## Project layout

- `app/` — Next.js App Router pages (`/`, `/merchant`)
- `components/web3/` — wallet UI (Connect button, network gate, modal)
- `components/merchant/` — merchant dashboard surfaces
- `hooks/` — wagmi-aware React hooks (e.g. `useCreatePlan`)
- `lib/chain/` — wagmi config, networks, token allow-list, BillingHub binding
- `lib/utils/` — pure helpers (formatting, address utilities)
- `contracts/` — Foundry workspace for `BillingHub.sol`

## Local development

```bash
npm run dev    # serves on 0.0.0.0:5000
```
