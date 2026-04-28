# Phase 8 — BillingHub Deployment on Polygon Amoy

> **Goal:** Deploy `BillingHub.sol` to Polygon Amoy testnet, verify source code on Polygonscan, then wire the deployed address into the Next.js frontend.

---

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Foundry (`forge`, `cast`) | `forge 0.2+` | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Git | any | system |
| MATIC (Amoy testnet) | ≥ 0.1 | [Polygon Faucet](https://faucet.polygon.technology/) |
| Polygonscan API key | — | [polygonscan.com/myapikey](https://polygonscan.com/myapikey) |

---

## Step 1 — Clone dependencies (one-time)

Run from **inside** the `contracts/` directory:

```bash
cd contracts

forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge install foundry-rs/forge-std --no-commit
```

Foundry writes the two libraries into `contracts/lib/` (which is `.gitignore`d — re-run on every fresh clone).

---

## Step 2 — Build and test locally

```bash
forge build
forge test -vv
```

All tests must pass before broadcasting. Expected output: **17 tests, 0 failures**.

---

## Step 3 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in **three values**:

```dotenv
PRIVATE_KEY=0x<your-deployer-private-key>
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGONSCAN_API_KEY=<your-polygonscan-api-key>
```

> **Security:** `.env` is `.gitignore`d. Never paste your private key anywhere else.
>
> **Faucet:** The deployer wallet needs test MATIC on Amoy.  
> Get some free at <https://faucet.polygon.technology/> (select "Polygon Amoy").

---

## Step 4 — Dry-run (simulate, no on-chain effect)

```bash
source .env

forge script script/Deploy.s.sol:Deploy \
  --rpc-url amoy \
  --private-key $PRIVATE_KEY \
  -vvvv
```

This runs the full script against a local fork of Amoy. Confirm the console output shows:

```
=== SubSmart BillingHub deployment ===
Deployer  : 0x<your-address>
Treasury  : 0x<your-address>   ← same as deployer for testnet
Chain ID  : 80002
----------------------------------------------
BillingHub deployed at: 0x<simulated-address>
----------------------------------------------
```

No transaction is broadcast. The simulated address will differ from the real one.

---

## Step 5 — Deploy and verify in one shot

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url amoy \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  -vvvv
```

`--broadcast` signs and submits the transaction.  
`--verify` submits source code to Polygonscan automatically once the tx is confirmed.  
The Amoy chain ID (80002) and Polygonscan endpoint are already wired into `foundry.toml` via the `[rpc_endpoints]` and `[etherscan]` sections — no extra flags needed.

Forge writes a deployment receipt to:

```
contracts/broadcast/Deploy.s.sol/80002/run-latest.json
```

Commit that file — it is your on-chain audit trail.

---

## Step 6 — Record the deployed address

The console output ends with:

```
----------------------------------------------
BillingHub deployed at: 0xABCD...1234
----------------------------------------------
Add to frontend .env.local:
NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY=0xABCD...1234
```

Open the **root** `.env.local` (create it if absent, it is already `.gitignore`d) and add:

```dotenv
NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY=0xABCD...1234
```

Then restart the Next.js dev server so the env var is picked up:

```bash
# In the project root (not contracts/)
npm run dev
```

The checkout and merchant flows will now point at the live Amoy contract.

---

## Step 7 — Verify the deployment on Polygonscan (manual fallback)

If `--verify` timed out or failed (rare on Amoy), run separately:

```bash
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  src/BillingHub.sol:BillingHub \
  --constructor-args $(cast abi-encode "constructor(address)" <TREASURY_ADDRESS>) \
  --chain-id 80002 \
  --etherscan-api-key $POLYGONSCAN_API_KEY \
  --verifier-url https://api-amoy.polygonscan.com/api
```

Replace `<DEPLOYED_ADDRESS>` and `<TREASURY_ADDRESS>` with the values from Step 5.

---

## Step 8 — Smoke test on Amoy

1. Open the frontend, connect a wallet on Polygon Amoy (chain ID 80002).
2. Go to the **Merchant** → **Create Plan** flow and create a test plan (use any Amoy ERC-20 with EIP-2612 Permit, e.g. [Amoy USDC](https://amoy.polygonscan.com/token/0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582)).
3. Copy the plan ID and navigate to `/checkout/<planId>`.
4. Complete the permit-sign + subscribe flow.
5. Confirm the `Subscribed` event appears on Polygonscan under the BillingHub contract's **Events** tab.

---

## Network reference

| Parameter | Value |
|-----------|-------|
| Network name | Polygon Amoy |
| Chain ID | `80002` |
| Native token | MATIC (test) |
| RPC (public) | `https://rpc-amoy.polygon.technology` |
| Block explorer | <https://amoy.polygonscan.com> |
| Faucet | <https://faucet.polygon.technology/> |

---

## Mainnet checklist (when ready)

- [ ] Replace the `treasury` in `Deploy.s.sol` with a gnosis-safe multisig address — NOT the deployer EOA.
- [ ] Add `[rpc_endpoints] polygon = "${POLYGON_RPC_URL}"` and the corresponding `[etherscan]` entry to `foundry.toml`.
- [ ] Re-run `forge test -vv` against a mainnet fork: `forge test --fork-url $POLYGON_RPC_URL`.
- [ ] Set `NEXT_PUBLIC_BILLING_HUB_ADDRESS_POLYGON=<mainnet-address>` in production env vars.
- [ ] Commit the `broadcast/Deploy.s.sol/137/run-latest.json` receipt.
