import { describe, expect, it } from 'vitest'
import { buildCandles, candleStart } from './dex'
import type { Trade } from './dex'

const time = (iso: string) => Date.parse(iso)
const start = (iso: string) => time(iso) / 1000

describe('calendar candles', () => {
  it('starts weeks on Monday UTC across year boundaries', () => {
    expect(candleStart(time('2026-01-04T23:59:59Z'), '1w')).toBe(
      start('2025-12-29T00:00:00Z'),
    )
    expect(candleStart(time('2026-01-05T00:00:00Z'), '1w')).toBe(
      start('2026-01-05T00:00:00Z'),
    )
  })
  it('uses actual calendar months including leap February', () => {
    expect(candleStart(time('2024-02-29T23:59:59Z'), '1M')).toBe(
      start('2024-02-01T00:00:00Z'),
    )
    expect(candleStart(time('2024-03-01T00:00:00Z'), '1M')).toBe(
      start('2024-03-01T00:00:00Z'),
    )
    expect(candleStart(time('2026-12-31T23:59:59Z'), '1M')).toBe(
      start('2026-12-01T00:00:00Z'),
    )
  })
  it('aggregates unsorted trades into OHLCV, carries the previous close and skips empty months', () => {
    const trade = (
      iso: string,
      price: number,
      mid: number,
      amount: number,
    ): Trade => ({
      id: iso,
      tx: iso,
      time: time(iso),
      side: 'buy',
      price,
      mid,
      amount,
      account: '',
    })
    const trades = [
      trade('2024-04-01T00:00:00Z', 50, 40, 4),
      trade('2024-02-29T23:00:00Z', 12, 8, 3),
      trade('2024-02-01T00:00:00Z', 10, 12, 2),
    ]
    expect(buildCandles(trades, '1M')).toEqual([
      {
        time: start('2024-02-01T00:00:00Z'),
        open: 10,
        high: 12,
        low: 8,
        close: 8,
        volume: 5,
      },
      {
        time: start('2024-04-01T00:00:00Z'),
        open: 8,
        high: 40,
        low: 8,
        close: 40,
        volume: 4,
      },
    ])
    expect(buildCandles([], '1w')).toEqual([])
  })
  it('keeps existing intraday boundaries', () => {
    expect(candleStart(time('2026-10-27T12:34:56Z'), '1h')).toBe(
      start('2026-10-27T12:00:00Z'),
    )
  })
})
