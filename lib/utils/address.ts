import { getAddress } from "viem";

/**
 * Truncate a checksummed EVM address for compact display.
 * Always re-checksums input first, per docs/3_AI_CODING_GUIDELINES.md §4.5.
 */
export function shortenAddress(address: string, chars: number = 4): string {
  const checksummed = getAddress(address);
  return `${checksummed.slice(0, 2 + chars)}…${checksummed.slice(-chars)}`;
}
