/**
 * Technical indicators for KoinFlow charts.
 *
 * Everything here is pure and works on plain `{ time, value }` series so an
 * indicator can run on any source: a pair's closes, a ratio between two pairs,
 * or another indicator's output (e.g. "SMA of the RSI of KOIN÷VHP").
 *
 * To add an indicator, write its maths as a function and register it in
 * `INDICATORS` with its params and placement; the chart and the picker read
 * the registry, so nothing else needs to change.
 */
import type { Candle } from '@/lib/dex'

export type Point = { time: number; value: number }

// ---------------------------------------------------------------------------
// Maths

export function sma(points: Point[], period: number): Point[] {
  const out: Point[] = []
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i].value
    if (i >= period) sum -= points[i - period].value
    if (i >= period - 1) out.push({ time: points[i].time, value: sum / period })
  }
  return out
}

/** EMA seeded with the SMA of the first `period` values. */
export function ema(points: Point[], period: number): Point[] {
  if (points.length < period) return []
  const k = 2 / (period + 1)
  let prev = points.slice(0, period).reduce((s, p) => s + p.value, 0) / period
  const out: Point[] = [{ time: points[period - 1].time, value: prev }]
  for (let i = period; i < points.length; i++) {
    prev = points[i].value * k + prev * (1 - k)
    out.push({ time: points[i].time, value: prev })
  }
  return out
}

/** Wilder's RSI, 0–100. */
export function rsi(points: Point[], period: number): Point[] {
  if (points.length <= period) return []
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = points[i].value - points[i - 1].value
    if (d > 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  const value = () =>
    loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss)
  const out: Point[] = [{ time: points[period].time, value: value() }]
  for (let i = period + 1; i < points.length; i++) {
    const d = points[i].value - points[i - 1].value
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out.push({ time: points[i].time, value: value() })
  }
  return out
}

export function macd(
  points: Point[],
  fast: number,
  slow: number,
  signal: number,
) {
  const f = new Map(ema(points, fast).map((p) => [p.time, p.value]))
  const line = ema(points, slow)
    .filter((p) => f.has(p.time))
    .map((p) => ({ time: p.time, value: f.get(p.time)! - p.value }))
  const sig = ema(line, signal)
  const s = new Map(sig.map((p) => [p.time, p.value]))
  const hist = line
    .filter((p) => s.has(p.time))
    .map((p) => ({ time: p.time, value: p.value - s.get(p.time)! }))
  return { line, signal: sig, hist }
}

/**
 * VWAP from candles' typical price. Intraday timeframes reset at each UTC day,
 * like a session VWAP; daily and longer accumulate over the loaded history.
 */
export function vwap(candles: Candle[], resetDaily: boolean): Point[] {
  const out: Point[] = []
  let pv = 0
  let vol = 0
  let day = -1
  for (const c of candles) {
    const d = Math.floor(c.time / 86_400)
    if (resetDaily && d !== day) {
      pv = 0
      vol = 0
      day = d
    }
    const typical = (c.high + c.low + c.close) / 3
    pv += typical * c.volume
    vol += c.volume
    out.push({ time: c.time, value: vol > 0 ? pv / vol : typical })
  }
  return out
}

export type ProfileBin = {
  low: number
  high: number
  /** Volume from candles that closed up / down. */
  up: number
  down: number
}

/**
 * Volume by price: each candle's volume is spread evenly across the bins its
 * high–low range touches.
 */
export function volumeProfile(candles: Candle[], bins: number): ProfileBin[] {
  if (candles.length === 0) return []
  const lo = Math.min(...candles.map((c) => c.low))
  const hi = Math.max(...candles.map((c) => c.high))
  if (!(hi > lo)) return []
  const step = (hi - lo) / bins
  const out: ProfileBin[] = Array.from({ length: bins }, (_, i) => ({
    low: lo + step * i,
    high: lo + step * (i + 1),
    up: 0,
    down: 0,
  }))
  for (const c of candles) {
    const a = Math.min(bins - 1, Math.floor((c.low - lo) / step))
    const b = Math.min(bins - 1, Math.floor((c.high - lo) / step))
    const share = c.volume / (b - a + 1)
    for (let i = a; i <= b; i++) {
      if (c.close >= c.open) out[i].up += share
      else out[i].down += share
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Registry

export type ParamDef = {
  key: string
  label: string
  min: number
  max: number
  default: number
}

export type IndicatorInput = {
  points: Point[]
  /** Only present for pair sources, which carry OHLCV. */
  candles: Candle[] | null
  /** Candle period shorter than a day. */
  intraday: boolean
}

export type IndicatorOutput = {
  name: string
  kind: 'line' | 'histogram'
  data: Point[]
  /** Signed histogram bars are coloured by sign. */
  signed?: boolean
  /** Horizontal guides, e.g. RSI 30/70. */
  levels?: number[]
  /** A bounded score (e.g. RSI) rather than a value in the source's units. */
  unitless?: boolean
}

type BaseDef = {
  type: string
  name: string
  short: string
  description: string
  params: ParamDef[]
  /** Needs OHLCV, so it can't run on ratios or other indicators. */
  needsVolume: boolean
}

export type IndicatorDef =
  | (BaseDef & {
      /** Drawn on top of its source (overlay) or in its own pane below. */
      placement: 'overlay' | 'pane'
      compute: (
        input: IndicatorInput,
        params: Record<string, number>,
      ) => IndicatorOutput[]
    })
  | (BaseDef & {
      placement: 'profile'
      profile: (
        candles: Candle[],
        params: Record<string, number>,
      ) => ProfileBin[]
    })

const period = (d: number, label = 'Period'): ParamDef => ({
  key: 'period',
  label,
  min: 2,
  max: 200,
  default: d,
})

export const INDICATORS: IndicatorDef[] = [
  {
    type: 'sma',
    name: 'Simple moving average',
    short: 'SMA',
    description: 'Mean of the last N values.',
    params: [period(20)],
    needsVolume: false,
    placement: 'overlay',
    compute: ({ points }, p) => [
      { name: 'SMA', kind: 'line', data: sma(points, p.period) },
    ],
  },
  {
    type: 'ema',
    name: 'Exponential moving average',
    short: 'EMA',
    description: 'Moving average weighted toward recent values.',
    params: [period(21)],
    needsVolume: false,
    placement: 'overlay',
    compute: ({ points }, p) => [
      { name: 'EMA', kind: 'line', data: ema(points, p.period) },
    ],
  },
  {
    type: 'rsi',
    name: 'Relative strength index',
    short: 'RSI',
    description: 'Momentum oscillator from 0 to 100.',
    params: [period(14)],
    needsVolume: false,
    placement: 'pane',
    compute: ({ points }, p) => [
      {
        name: 'RSI',
        kind: 'line',
        data: rsi(points, p.period),
        levels: [30, 70],
        unitless: true,
      },
    ],
  },
  {
    type: 'macd',
    name: 'MACD',
    short: 'MACD',
    description: 'Fast EMA minus slow EMA, with a signal line.',
    params: [
      { key: 'fast', label: 'Fast', min: 2, max: 100, default: 12 },
      { key: 'slow', label: 'Slow', min: 3, max: 200, default: 26 },
      { key: 'signal', label: 'Signal', min: 2, max: 100, default: 9 },
    ],
    needsVolume: false,
    placement: 'pane',
    compute: ({ points }, p) => {
      const m = macd(points, p.fast, p.slow, p.signal)
      return [
        { name: 'Hist', kind: 'histogram', data: m.hist, signed: true },
        { name: 'MACD', kind: 'line', data: m.line, levels: [0] },
        { name: 'Signal', kind: 'line', data: m.signal },
      ]
    },
  },
  {
    type: 'vwap',
    name: 'VWAP',
    short: 'VWAP',
    description:
      'Volume-weighted average price. Resets daily (UTC) on intraday timeframes.',
    params: [],
    needsVolume: true,
    placement: 'overlay',
    compute: ({ candles, intraday }) => [
      { name: 'VWAP', kind: 'line', data: vwap(candles ?? [], intraday) },
    ],
  },
  {
    type: 'vp',
    name: 'Volume profile',
    short: 'VP',
    description: 'Volume traded at each price level across loaded swaps.',
    params: [{ key: 'bins', label: 'Rows', min: 6, max: 60, default: 24 }],
    needsVolume: true,
    placement: 'profile',
    profile: (candles, p) => volumeProfile(candles, p.bins),
  },
]

export function indicatorDef(type: string) {
  return INDICATORS.find((d) => d.type === type)
}

export function defaultParams(def: IndicatorDef) {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]))
}

/** Params clamped to their ranges, falling back to defaults. */
export function resolveParams(
  def: IndicatorDef,
  params: Record<string, number> | undefined,
) {
  return Object.fromEntries(
    def.params.map((p) => {
      const v = Math.round(Number(params?.[p.key]))
      return [
        p.key,
        Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default,
      ]
    }),
  )
}

export function indicatorLabel(
  def: IndicatorDef,
  params: Record<string, number>,
) {
  const values = def.params.map((p) => params[p.key])
  return values.length ? `${def.short}(${values.join(', ')})` : def.short
}
