import { describe, expect, it } from 'vitest'

import {
  buildChartModel,
  invertCandles,
  parseSettings,
  ratioSeries,
} from './chart-model'
import type { Candle } from './dex'
import { ema, macd, rsi, sma, volumeProfile, vwap } from './indicators'

const pts = (values: number[]) =>
  values.map((value, i) => ({ time: i * 60, value }))
const candle = (time: number, close: number, volume = 1): Candle => ({
  time,
  open: close,
  high: close * 1.01,
  low: close * 0.99,
  close,
  volume,
})

describe('indicators', () => {
  it('computes SMA and EMA once the window fills', () => {
    expect(sma(pts([1, 2, 3, 4]), 2).map((p) => p.value)).toEqual([
      1.5, 2.5, 3.5,
    ])
    const e = ema(pts([1, 2, 3, 4]), 2)
    expect(e[0]).toEqual({ time: 60, value: 1.5 })
    expect(e[1].value).toBeCloseTo(2.5)
  })

  it('keeps RSI within 0–100 and saturates on one-way moves', () => {
    expect(rsi(pts([1, 2, 3, 4, 5, 6]), 3).every((p) => p.value === 100)).toBe(
      true,
    )
    const mixed = rsi(pts([5, 6, 5, 7, 6, 8, 7, 9]), 3)
    expect(mixed.every((p) => p.value > 0 && p.value < 100)).toBe(true)
  })

  it('aligns MACD line, signal and histogram on time', () => {
    const series = pts(
      Array.from({ length: 60 }, (_, i) => 10 + Math.sin(i / 4)),
    )
    const m = macd(series, 12, 26, 9)
    expect(m.line).toHaveLength(60 - 25)
    expect(m.signal).toHaveLength(m.line.length - 8)
    expect(m.hist[0].time).toBe(m.signal[0].time)
  })

  it('resets VWAP at each UTC day on intraday candles', () => {
    const day = 86_400
    const v = vwap([candle(day - 60, 10, 1), candle(day, 20, 1)], true)
    expect(v[1].value).toBeCloseTo(20)
    expect(
      vwap([candle(0, 10, 1), candle(60, 20, 1)], false)[1].value,
    ).toBeCloseTo(15)
  })

  it('spreads volume across the price bins a candle covers', () => {
    const bins = volumeProfile([candle(0, 10, 4), candle(60, 20, 2)], 4)
    const total = bins.reduce((s, b) => s + b.up + b.down, 0)
    expect(total).toBeCloseTo(6)
  })
})

describe('comparison series', () => {
  it('forward-fills both sides when building a ratio', () => {
    const r = ratioSeries(
      [
        { time: 0, value: 10 },
        { time: 120, value: 20 },
      ],
      [
        { time: 60, value: 2 },
        { time: 180, value: 4 },
      ],
    )
    expect(r).toEqual([
      { time: 60, value: 5 },
      { time: 120, value: 10 },
      { time: 180, value: 5 },
    ])
  })

  it('inverts candles and swaps high/low', () => {
    const [c] = invertCandles([
      { time: 0, open: 2, high: 4, low: 1, close: 2, volume: 3 },
    ])
    expect(c.high).toBe(1)
    expect(c.low).toBe(0.25)
    expect(c.volume).toBe(6)
  })

  it('rebases every pair to 0% at a common start', () => {
    const model = buildChartModel({
      primary: {
        pool: 'a',
        label: 'A',
        candles: [candle(0, 1), candle(60, 2), candle(120, 3)],
      },
      compares: [
        { pool: 'b', label: 'B', candles: [candle(60, 10), candle(120, 5)] },
      ],
      mode: 'percent',
      indicators: [],
      intraday: true,
    })
    expect(model.main?.candles[1].close).toBeCloseTo(0)
    expect(model.main?.candles[2].close).toBeCloseTo(50)
    expect(model.lines[0].data.map((p) => p.value)).toEqual([0, -50])
  })

  it('chains indicators: RSI of a ratio, then an SMA of that RSI in the same pane', () => {
    const primary = Array.from({ length: 40 }, (_, i) =>
      candle(i * 60, 10 + (i % 5)),
    )
    const other = Array.from({ length: 40 }, (_, i) =>
      candle(i * 60, 5 + (i % 3)),
    )
    const model = buildChartModel({
      primary: { pool: 'a', label: 'A', candles: primary },
      compares: [{ pool: 'b', label: 'B', candles: other }],
      mode: 'overlay',
      indicators: [
        { id: 'r', type: 'rsi', source: 'ratio:b', params: { period: 14 } },
        { id: 's', type: 'sma', source: 'ind:r', params: { period: 5 } },
        { id: 'v', type: 'vwap', source: 'ratio:b', params: {} },
      ],
      intraday: true,
    })
    const rsiLine = model.lines.find((l) => l.key === 'r:0')!
    const smaLine = model.lines.find((l) => l.key === 's:0')!
    expect(rsiLine.pane).toBe(1)
    expect(smaLine.pane).toBe(1)
    expect(model.panes[1]).toContain('RSI(14)')
    expect(model.notes).toHaveLength(1)
    expect(model.leftScale).toBe(true)
  })

  it('falls back to defaults for malformed saved settings', () => {
    expect(parseSettings({ mode: 'nope', compares: 'x' })).toEqual({
      mode: 'overlay',
      compares: [],
      indicators: [],
    })
  })
})
