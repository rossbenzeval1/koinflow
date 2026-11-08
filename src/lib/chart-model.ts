/**
 * Turns the trade terminal's chart settings (comparison pairs, compare mode and
 * indicators) plus loaded candles into a flat, render-ready model for
 * `CandleChart`. Pure, so it's unit-tested without a canvas.
 *
 * Sources are addressed by key:
 * - `primary`: the terminal's pair (OHLCV)
 * - `pool:<id>`: a comparison pair (OHLCV, optionally inverted)
 * - `ratio:<id>`: primary close ÷ comparison close, time-aligned
 * - `ind:<id>`: the main line of another indicator, so indicators chain
 */
import { z } from 'zod'

import type { Candle } from '@/lib/dex'
import { indicatorDef, indicatorLabel, resolveParams } from '@/lib/indicators'
import type { Point, ProfileBin } from '@/lib/indicators'

// lightweight-charts draws on canvas, so series colours are hex constants.
export const UP = '#16a06c'
export const DOWN = '#de3c44'
export const COMPARE_COLORS = ['#2563eb', '#d97706', '#9333ea'] as const
const INDICATOR_COLORS = [
  '#0e7490',
  '#c2410c',
  '#7c3aed',
  '#4d7c0f',
  '#be185d',
  '#0369a1',
]
const SECONDARY = '#e08a1e'

export const MAX_COMPARES = COMPARE_COLORS.length
export const MAX_INDICATORS = 8

// ---------------------------------------------------------------------------
// Settings (persisted in localStorage, so parsed tolerantly)

export const compareModes = [
  { id: 'overlay', label: 'Overlay', hint: 'Each pair on its own price axis' },
  {
    id: 'percent',
    label: '% change',
    hint: 'All pairs rebased to 0% at a common start',
  },
  { id: 'ratio', label: 'Ratio', hint: 'This pair ÷ each comparison pair' },
] as const

export type CompareMode = (typeof compareModes)[number]['id']

const settingsSchema = z.object({
  mode: z.enum(['overlay', 'percent', 'ratio']).catch('overlay'),
  compares: z
    .array(z.object({ pool: z.string(), invert: z.boolean().catch(false) }))
    .catch([])
    .transform((c) => c.slice(0, MAX_COMPARES)),
  indicators: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        source: z.string().catch('primary'),
        params: z.record(z.string(), z.number()).catch({}),
      }),
    )
    .catch([])
    .transform((list) =>
      list.filter((i) => indicatorDef(i.type)).slice(0, MAX_INDICATORS),
    ),
})

export type ChartSettings = z.infer<typeof settingsSchema>
export type IndicatorConfig = ChartSettings['indicators'][number]

export const DEFAULT_SETTINGS: ChartSettings = {
  mode: 'overlay',
  compares: [],
  indicators: [],
}

export function parseSettings(raw: unknown): ChartSettings {
  const r = settingsSchema.safeParse(raw)
  return r.success ? r.data : DEFAULT_SETTINGS
}

// ---------------------------------------------------------------------------
// Series helpers

export type PairSeries = { pool: string; label: string; candles: Candle[] }

export function closes(candles: Candle[]): Point[] {
  return candles.map((c) => ({ time: c.time, value: c.close }))
}

/** Quote ÷ base view of a pair: 1/price, with high and low swapped. */
export function invertCandles(candles: Candle[]): Candle[] {
  return candles
    .filter((c) => c.low > 0)
    .map((c) => ({
      time: c.time,
      open: 1 / c.open,
      high: 1 / c.low,
      low: 1 / c.high,
      close: 1 / c.close,
      volume: c.volume * c.close,
    }))
}

/** Last value at or before `time`, from a time-sorted series. */
function valueAt(points: Point[], time: number) {
  let lo = 0
  let hi = points.length - 1
  let found: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      found = points[mid].value
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * `a ÷ b` on the union of both series' timestamps, forward-filling whichever
 * side didn't trade in a period. Starts once both have a value.
 */
export function ratioSeries(a: Point[], b: Point[]): Point[] {
  if (!a.length || !b.length) return []
  const start = Math.max(a[0].time, b[0].time)
  const times = [...new Set([...a, ...b].map((p) => p.time))]
    .filter((t) => t >= start)
    .sort((x, y) => x - y)
  const out: Point[] = []
  for (const t of times) {
    const va = valueAt(a, t)
    const vb = valueAt(b, t)
    if (va != null && vb) out.push({ time: t, value: va / vb })
  }
  return out
}

// ---------------------------------------------------------------------------
// Model

export type Format = 'price' | 'percent' | 'number'

export type ChartLine = {
  key: string
  label: string
  color: string
  kind: 'line' | 'histogram'
  data: { time: number; value: number; color?: string }[]
  pane: number
  /** `right`, `left`, or an overlay scale id (no visible axis). */
  scale: string
  format: Format
  levels?: number[]
  width: 1 | 2
}

export type ChartModel = {
  /** Primary pair as candles on the right axis; null in ratio mode. */
  main: { candles: Candle[]; format: Format } | null
  /** Volume histogram for the primary pair. */
  volume: Candle[] | null
  lines: ChartLine[]
  /** Volume profiles, drawn against the series `seriesKey` (`main` or a line key). */
  profiles: {
    key: string
    seriesKey: string
    color: string
    bins: ProfileBin[]
  }[]
  leftScale: boolean
  /** Labels for indicator panes below the price pane, by pane index. */
  panes: Record<number, string>
  /** Indicators that couldn't be drawn, and why. */
  notes: string[]
}

export type SourceOption = { key: string; label: string; hasVolume: boolean }

type Source = { label: string; points: Point[]; candles: Candle[] | null }
type Display = {
  seriesKey: string
  pane: number
  scale: string
  format: Format
  transform: (v: number) => number
}

/** Sources indicators can read, in picker order (indicators excluded). */
export function sourceOptions(
  primary: { label: string },
  compares: { pool: string; label: string }[],
): SourceOption[] {
  return [
    { key: 'primary', label: primary.label, hasVolume: true },
    ...compares.map((c) => ({
      key: `pool:${c.pool}`,
      label: c.label,
      hasVolume: true,
    })),
    ...compares.map((c) => ({
      key: `ratio:${c.pool}`,
      label: `${primary.label} ÷ ${c.label}`,
      hasVolume: false,
    })),
  ]
}

export function buildChartModel({
  primary,
  compares,
  mode: requestedMode,
  indicators,
  intraday,
}: {
  primary: PairSeries
  /** Comparison pairs that have loaded, already inverted where requested. */
  compares: PairSeries[]
  mode: CompareMode
  indicators: IndicatorConfig[]
  intraday: boolean
}): ChartModel {
  const loaded = compares.filter((c) => c.candles.length > 0)
  const mode =
    requestedMode === 'ratio' && compares.length === 0
      ? 'overlay'
      : requestedMode
  const primaryPoints = closes(primary.candles)

  const sources = new Map<string, Source>()
  sources.set('primary', {
    label: primary.label,
    points: primaryPoints,
    candles: primary.candles,
  })
  for (const c of compares) {
    sources.set(`pool:${c.pool}`, {
      label: c.label,
      points: closes(c.candles),
      candles: c.candles,
    })
    sources.set(`ratio:${c.pool}`, {
      label: `${primary.label} ÷ ${c.label}`,
      points: ratioSeries(primaryPoints, closes(c.candles)),
      candles: null,
    })
  }

  const model: ChartModel = {
    main: null,
    volume: null,
    lines: [],
    profiles: [],
    leftScale: false,
    panes: {},
    notes: [],
  }
  const displayed = new Map<string, Display>()
  const identity = (v: number) => v

  // Percent mode rebases every pair to its close at the latest common start.
  const rebase = (points: Point[]) => {
    const start = Math.max(
      ...[primaryPoints, ...loaded.map((c) => closes(c.candles))]
        .filter((p) => p.length)
        .map((p) => p[0].time),
    )
    const base = valueAt(points, start) ?? points[0]?.value
    return base ? (v: number) => (v / base - 1) * 100 : identity
  }

  if (mode !== 'ratio') {
    const transform = mode === 'percent' ? rebase(primaryPoints) : identity
    const format: Format = mode === 'percent' ? 'percent' : 'price'
    model.main = {
      format,
      candles: primary.candles.map((c) => ({
        ...c,
        open: transform(c.open),
        high: transform(c.high),
        low: transform(c.low),
        close: transform(c.close),
      })),
    }
    model.volume = primary.candles
    displayed.set('primary', {
      seriesKey: 'main',
      pane: 0,
      scale: 'right',
      format,
      transform,
    })
  }

  compares.forEach((c, i) => {
    const key = mode === 'ratio' ? `ratio:${c.pool}` : `pool:${c.pool}`
    const src = sources.get(key)!
    const transform = mode === 'percent' ? rebase(src.points) : identity
    const scale =
      mode === 'percent'
        ? 'right'
        : i === 0
          ? mode === 'ratio'
            ? 'right'
            : 'left'
          : `cmp-${i}`
    const format: Format = mode === 'percent' ? 'percent' : 'price'
    if (scale === 'left') model.leftScale = true
    model.lines.push({
      key,
      label: src.label,
      color: COMPARE_COLORS[i % COMPARE_COLORS.length],
      kind: 'line',
      data: src.points.map((p) => ({
        time: p.time,
        value: transform(p.value),
      })),
      pane: 0,
      scale,
      format,
      width: 2,
    })
    displayed.set(key, { seriesKey: key, pane: 0, scale, format, transform })
  })

  let nextPane = 1
  indicators.forEach((cfg, i) => {
    const def = indicatorDef(cfg.type)
    if (!def) return
    const params = resolveParams(def, cfg.params)
    const src = sources.get(cfg.source)
    const name = indicatorLabel(def, params)
    const color = INDICATOR_COLORS[i % INDICATOR_COLORS.length]
    if (!src) {
      model.notes.push(`${name}: its source is no longer on the chart.`)
      return
    }
    const label = `${name} · ${src.label}`
    if (def.needsVolume && !src.candles) {
      model.notes.push(
        `${label}: needs a pair with volume, not a ratio or indicator.`,
      )
      return
    }

    if (def.placement === 'profile') {
      const d = displayed.get(cfg.source)
      if (!d || d.pane !== 0) {
        model.notes.push(
          `${label}: shown only while its pair is drawn on the chart.`,
        )
        return
      }
      model.profiles.push({
        key: cfg.id,
        seriesKey: d.seriesKey,
        color,
        bins: def.profile(src.candles!, params).map((b) => ({
          ...b,
          low: d.transform(b.low),
          high: d.transform(b.high),
        })),
      })
      return
    }

    const outputs = def.compute(
      { points: src.points, candles: src.candles, intraday },
      params,
    )
    const target = displayed.get(cfg.source)
    let place: Omit<Display, 'seriesKey'>
    if (def.placement === 'pane') {
      const pane = nextPane++
      model.panes[pane] = label
      place = {
        pane,
        scale: 'right',
        format: outputs.some((o) => o.unitless) ? 'number' : 'price',
        transform: identity,
      }
    } else if (target) {
      place = target
    } else {
      place = {
        pane: 0,
        scale: `ind-${cfg.id}`,
        format: 'price',
        transform: identity,
      }
    }

    let lineIndex = 0
    let mainKey: string | null = null
    outputs.forEach((o, j) => {
      const key = `${cfg.id}:${j}`
      const outColor =
        o.kind === 'histogram' ? color : lineIndex++ === 0 ? color : SECONDARY
      model.lines.push({
        key,
        label: outputs.length > 1 ? `${o.name} · ${label}` : label,
        color: outColor,
        kind: o.kind,
        data: o.data.map((p) => ({
          time: p.time,
          value: place.transform(p.value),
          color: o.signed
            ? p.value >= 0
              ? `${UP}99`
              : `${DOWN}99`
            : undefined,
        })),
        pane: place.pane,
        scale: place.scale,
        format: place.format,
        levels: o.levels,
        width:
          o.kind === 'line' && j === outputs.findIndex((x) => x.kind === 'line')
            ? 2
            : 1,
      })
      if (o.kind === 'line' && mainKey === null) {
        mainKey = key
        // Expose the main line so later indicators can chain from it.
        sources.set(`ind:${cfg.id}`, { label, points: o.data, candles: null })
        displayed.set(`ind:${cfg.id}`, { ...place, seriesKey: key })
      }
    })
  })

  return model
}
