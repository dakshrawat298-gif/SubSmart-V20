import { formatUnits } from "viem";
import type { Chain } from "viem";

/**
 * Cycle-length presets exposed in the merchant UI. Stored as exact integer
 * second counts — never floating-point — so the value passed to `createPlan`
 * is reproducible across timezones and DST transitions.
 *
 * Calendar months/years are intentionally absent: a "monthly" subscription on
 * a fixed-second cadence (here: 30 days) is far simpler to reason about
 * on-chain than an EVM-time approximation of calendar arithmetic.
 */
export const CYCLE_PRESETS = [
  { label: "Daily", seconds: 86_400n },
  { label: "Weekly", seconds: 604_800n },
  { label: "Monthly (30 days)", seconds: 2_592_000n },
  { label: "Quarterly (90 days)", seconds: 7_776_000n },
  { label: "Yearly (365 days)", seconds: 31_536_000n },
] as const satisfies ReadonlyArray<{
  readonly label: string;
  readonly seconds: bigint;
}>;

export type CyclePreset = (typeof CYCLE_PRESETS)[number];

/**
 * Format a token amount (bigint in base units) to a human-readable string.
 * Uses viem's `formatUnits` for precision, then trims unnecessary trailing
 * zeros while keeping at least 2 decimal places.
 *
 * @example formatTokenAmount(25_000_000n, 6) → "25.00"
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  const raw = formatUnits(amount, decimals);
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return raw;
  const fixed = num.toFixed(Math.min(decimals, 6));
  const trimmed = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ".00");
  return trimmed;
}

/**
 * Convert a cycle length in seconds to a short human-readable label.
 *
 * @example formatCycleLengthHuman(2_592_000) → "30 days"
 */
export function formatCycleLengthHuman(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s === 86_400) return "day";
  if (s === 604_800) return "week";
  if (s === 2_592_000) return "30 days";
  if (s === 7_776_000) return "90 days";
  if (s === 31_536_000) return "year";
  const days = Math.round(s / 86_400);
  return `${days} days`;
}

/**
 * Format a Unix timestamp (seconds) as a locale date string.
 *
 * @example formatDeadline(1_800_000_000) → "January 15, 2027"
 */
export function formatDeadline(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Builds a Polygonscan transaction URL for the supplied chain. Falls back to
 * the chain's first configured `blockExplorers.default` URL — never a
 * hard-coded mainnet domain — so testnet (Amoy) tx hashes link to the
 * Amoyscan explorer, not to Polygonscan mainnet.
 *
 * Returns `undefined` when the chain has no configured block explorer; the
 * UI MUST handle this case explicitly (no broken links).
 */
export function buildExplorerTxUrl(
  chain: Chain | undefined,
  txHash: `0x${string}` | undefined
): string | undefined {
  if (!chain || !txHash) return undefined;
  const base = chain.blockExplorers?.default?.url;
  if (!base) return undefined;
  // Trim a single trailing slash so we never produce `//tx/`.
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/tx/${txHash}`;
}

/**
 * Truncate a `0x...` hash to a compact `0xabcd…1234` form for display.
 * Pure presentational helper — never used to compare hashes.
 */
export function shortenHash(hash: `0x${string}`): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}
