import { describe, expect, it } from 'vitest'
import type { Token, Trade } from './dex'
import { tierFor, traderStats } from './trader-tier'

const token = (id: string, usd: number) =>
  ({ id, symbol: id, usd }) as unknown as Token
const trade = (account: string, amount: number, price = 2): Trade => ({
  id: `${account}:${amount}`,
  tx: 'tx',
  time: 0,
  side: 'buy',
  price,
  mid: price,
  amount,
  account,
})

describe('trader tiers', () => {
  it('maps USD volume to tiers at the boundaries', () => {
    expect(tierFor(0).id).toBe('plankton')
    expect(tierFor(9.99).id).toBe('plankton')
    expect(tierFor(10).id).toBe('fish')
    expect(tierFor(100).id).toBe('shrimp')
    expect(tierFor(999).id).toBe('shrimp')
    expect(tierFor(1_000).id).toBe('dolphin')
    expect(tierFor(10_000).id).toBe('whale')
  })

  it('sums a wallet across its swaps', () => {
    const stats = traderStats(
      [trade('a', 30), trade('a', 30), trade('b', 1)],
      token('base', 10),
      token('quote', 1),
    )
    expect(stats.get('a')).toMatchObject({ volumeUsd: 600, swaps: 2 })
    expect(stats.get('a')?.tier.id).toBe('shrimp')
    expect(stats.get('b')?.tier.id).toBe('fish')
  })

  it('falls back to the quote price and skips unpriced pools', () => {
    const viaQuote = traderStats(
      [trade('a', 1000, 2)],
      token('base', 0),
      token('quote', 5),
    )
    expect(viaQuote.get('a')?.volumeUsd).toBe(10_000)
    expect(
      traderStats([trade('a', 1)], token('base', 0), token('quote', 0)).size,
    ).toBe(0)
  })
})
