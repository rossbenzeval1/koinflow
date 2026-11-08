import type { Token, Trade } from './dex'

/** Wallet size tiers, smallest to largest, as on DEX Screener. */
export const TRADER_TIERS = [
  { id: 'plankton', label: 'Plankton', min: 0 },
  { id: 'fish', label: 'Fish', min: 10 },
  { id: 'shrimp', label: 'Shrimp', min: 100 },
  { id: 'dolphin', label: 'Dolphin', min: 1_000 },
  { id: 'whale', label: 'Whale', min: 10_000 },
] as const

export type TraderTier = (typeof TRADER_TIERS)[number]

export type TraderStats = {
  tier: TraderTier
  /** Total USD swapped by the wallet in this pool across the loaded swaps. */
  volumeUsd: number
  swaps: number
}

export function tierFor(volumeUsd: number): TraderTier {
  let tier: TraderTier = TRADER_TIERS[0]
  for (const t of TRADER_TIERS) if (volumeUsd >= t.min) tier = t
  return tier
}

/** USD value of a swap, from the base price or, failing that, the quote price. */
export function tradeUsd(t: Trade, base: Token, quote: Token): number | null {
  if (base.usd > 0) return t.amount * base.usd
  if (quote.usd > 0) return t.amount * t.price * quote.usd
  return null
}

/**
 * Sizes each wallet by its total USD volume in the pool, so every swap from
 * the same wallet carries the same badge. Returns an empty map when neither
 * token has a USD price.
 */
export function traderStats(
  trades: Trade[],
  base: Token,
  quote: Token,
): Map<string, TraderStats> {
  const totals = new Map<string, { volumeUsd: number; swaps: number }>()
  for (const t of trades) {
    const usd = tradeUsd(t, base, quote)
    if (usd === null) return new Map()
    const cur = totals.get(t.account) ?? { volumeUsd: 0, swaps: 0 }
    cur.volumeUsd += usd
    cur.swaps += 1
    totals.set(t.account, cur)
  }
  const out = new Map<string, TraderStats>()
  for (const [account, s] of totals)
    out.set(account, { ...s, tier: tierFor(s.volumeUsd) })
  return out
}
