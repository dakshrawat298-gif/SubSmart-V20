# Phase 9 — Gelato Network Auto-Charge Integration

> **Goal:** Run `BillingHub.charge()` automatically for every due subscription via
> a Gelato Web3 Function (W3F) — a TypeScript script hosted on Gelato's
> decentralised infrastructure that executes on a time-based schedule.
>
> **No smart-contract changes.** `charge()` is already permissionless. Gelato
> simply acts as the gas-paying relayer; it has no privileged access to
> subscriber funds.

---

## How it works

```
Every N minutes
      │
      ▼
┌─────────────────────────────────────────────────┐
│           Gelato W3F (TypeScript)               │
│                                                 │
│  1. Scan new Subscribed events → update list   │
│  2. Rotate through active subscriptions        │
│  3. Check nextChargeTime ≤ now on-chain        │
│  4. Simulate charge() via eth_call             │
│  5. Return callData for passing simulations    │
└──────────────┬──────────────────────────────────┘
               │  canExec: true  +  callData[]
               ▼
       Gelato OpsProxy (on-chain)
               │  calls charge(planId, subscriber)
               ▼
         BillingHub.charge()
         ├─ transferFrom(subscriber → merchant)   (99.5%)
         └─ transferFrom(subscriber → treasury)   (0.5%)
```

**Key properties:**
- Gelato pays gas from the operator's 1Balance (a pre-funded MATIC pool).
- Subscribers' tokens never pass through Gelato — the non-custodial invariant holds.
- Failed simulations are logged and skipped — no wasted gas on guaranteed reverts.
- State is persisted in Gelato's key-value storage between runs.

---

## Directory layout

```
gelato/
  web3-functions/
    charge/
      index.ts      ← The Web3 Function (TypeScript)
      schema.json   ← userArgs definition + runtime config
  package.json
  tsconfig.json
  .env.example      ← Copy to .env for local testing
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | bundled with Node |
| BillingHub deployed | Complete Phase 8 first |
| Gelato account | [app.gelato.network](https://app.gelato.network) |
| Test MATIC on Amoy | [faucet.polygon.technology](https://faucet.polygon.technology/) |

---

## Step 1 — Install dependencies

```bash
cd gelato
npm install
```

---

## Step 2 — Configure the local test environment

```bash
cp .env.example .env
```

Edit `gelato/.env`:

```dotenv
PROVIDER_URLS={"80002":"https://rpc-amoy.polygon.technology"}
BH_ADDRESS=0x<your-deployed-BillingHub-address>
DEPLOY_BLOCK=<block-number-from-broadcast-receipt>
MAX_CHARGES_PER_RUN=10
```

**Finding `DEPLOY_BLOCK`:** Open
`contracts/broadcast/Deploy.s.sol/80002/run-latest.json` and read
`receipts[0].blockNumber`.

---

## Step 3 — Run locally against Amoy

This simulates a single execution of the W3F against the live Amoy chain
without submitting any transactions:

```bash
# From inside gelato/
npm run test:w3f -- \
  --chain-id 80002 \
  --user-args "{\"billingHubAddress\":\"$BH_ADDRESS\",\"deployBlock\":\"$DEPLOY_BLOCK\",\"maxChargesPerRun\":\"$MAX_CHARGES_PER_RUN\"}"
```

Expected output when no subscriptions exist yet:

```
> No subscriptions tracked yet. Scanned up to block <N>.
canExec: false
```

Expected output when at least one subscription is due:

```
> Tracking 3 sub(s). Checked 3. Pruned 0. Charges queued: 2. ...
canExec: true
callData: [{ to: "0x...", data: "0x..." }, ...]
```

---

## Step 4 — Deploy the Web3 Function to IPFS

Gelato's infrastructure fetches the W3F code from IPFS on every execution.

```bash
# From inside gelato/
npm run deploy:w3f
```

The CLI prints something like:

```
Web3Function deployed to IPFS.
CID: QmXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Save this CID** — you will paste it into the Gelato UI in the next step.

> Re-run `npm run deploy:w3f` any time you update `index.ts`.  The old task
> can be updated in the Gelato UI to point at the new CID without recreating
> the task.

---

## Step 5 — Fund Gelato 1Balance (gas tank)

The **1Balance** is a chain-agnostic MATIC pool that Gelato deducts from when
executing your tasks.

1. Go to [app.gelato.network](https://app.gelato.network) → **1Balance**.
2. Click **Deposit** and add at least **1 MATIC** of Amoy testnet MATIC
   (or more for production — see the gas estimate section below).
3. The balance is shared across all tasks in your account.

**Gas estimate per run (Amoy):**

| Subscriptions charged | Approx gas | Approx MATIC cost |
|----------------------|------------|-------------------|
| 1 | ~120 000 | ~0.003 MATIC |
| 5 | ~550 000 | ~0.015 MATIC |
| 10 | ~1 100 000 | ~0.030 MATIC |

Values are rough estimates at 25 gwei; mainnet costs will differ.

---

## Step 6 — Create the Gelato Task

1. Go to **[app.gelato.network](https://app.gelato.network)** and sign in.
2. Click **Create Task**.
3. Under **Trigger**, select **Web3 Function**.
4. Paste the **IPFS CID** from Step 4.
5. Set the **User Arguments**:

   | Argument | Value |
   |----------|-------|
   | `billingHubAddress` | `0x<your BillingHub address>` |
   | `deployBlock` | `<block number from Phase 8 receipt>` |
   | `maxChargesPerRun` | `10` (adjust to control gas per run) |

6. Under **Schedule**, select **Time Interval** and set:
   - **Amoy testnet:** every **5 minutes**
   - **Polygon mainnet:** every **1 hour** (most plans have day/month cycles)

   > There is no benefit to running faster than your shortest cycle length.
   > A 30-day billing plan only needs a run interval of a few hours.

7. Under **1Balance**, confirm it shows your funded balance.
8. Click **Create Task**.

---

## Step 7 — Verify the task is running

After the first execution interval passes:

1. Open your task on **app.gelato.network → Tasks**.
2. Click the task to see the **Execution History**.
3. Each run shows:
   - **Result:** `canExec: false` (nothing due) or `canExec: true` (charges submitted)
   - **Logs:** the console output from `index.ts` (subscriber count, pruned count, charges queued)
   - **Gas used** and **1Balance deducted**
4. For successful charges, the transaction hash links directly to Polygonscan.

---

## Step 8 — Monitor 1Balance

Set up a **low-balance alert** in the Gelato UI so you are notified before
your task stops executing:

1. **app.gelato.network → 1Balance → Alerts**.
2. Add your email and set a threshold (e.g. **0.5 MATIC** for testnet,
   **5 MATIC** for mainnet).

---

## Operational notes

### What happens if a subscriber's balance runs out?

The W3F simulates `charge()` via `eth_call` before queueing it. If the
subscriber has insufficient token balance or allowance, the simulation reverts
and the subscription is **skipped** (not pruned). It will be retried on the
next run — if the subscriber tops up their balance, the charge will succeed
automatically on the next interval.

### What happens when a subscription is cancelled?

Cancelled subscriptions have `active = false` on-chain. The W3F reads
`subscriptions(planId, subscriber).active` every time it checks a subscription.
When it finds `active = false`, it removes that entry from its tracked list
automatically — no manual intervention needed.

### What happens if the W3F times out (30 s limit)?

`MAX_CHECKS_PER_RUN = 50` ensures the runtime budget is never exhausted. The
rotating cursor means no subscription is permanently skipped — the next run
picks up from where the previous one stopped.

### Updating the W3F code

1. Edit `gelato/web3-functions/charge/index.ts`.
2. `npm run deploy:w3f` → get a new CID.
3. In the Gelato UI, open your task → **Edit** → paste the new CID → save.

---

## Mainnet checklist

- [ ] Increase `BLOCK_CHUNK` in `index.ts` if your RPC supports larger ranges
      (e.g. Alchemy / QuickNode support up to 2 000 blocks per request for free
      tiers and up to 10 000+ on paid plans).
- [ ] Set the task interval based on the shortest cycle length in active plans
      (e.g. 1-hour interval is sufficient for plans with ≥ 1-day cycles).
- [ ] Fund 1Balance with enough MATIC to sustain ~30 days of expected volume.
- [ ] Enable the low-balance email alert (Step 8).
- [ ] Point `billingHubAddress` at the mainnet contract address.
- [ ] Point `deployBlock` at the mainnet deployment block.
- [ ] Consider running a second, independent task as a backup relayer.

---

## Security model

| Threat | Mitigation |
|--------|-----------|
| Gelato submits an unauthorised charge | `charge()` is permissionless but stateful: it reverts with `ChargeNotDue` or `SubscriptionInactive` if preconditions fail. No over-charging is possible. |
| Gelato operator drains subscriber funds | Tokens flow directly from subscriber to merchant (and 0.5% to treasury). Gelato's OpsProxy never holds funds; it only calls `charge()`. |
| W3F submits a charge that reverts on-chain | eth_call simulation in Step 5d catches this before submission. Gas is spent only for transactions that are expected to succeed. |
| Large number of subscriptions causes timeout | Rotating cursor ensures no run exceeds `MAX_CHECKS_PER_RUN` reads. Timeout budget stays safe. |
