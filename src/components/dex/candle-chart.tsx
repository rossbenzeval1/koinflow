import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  IChartApi,
  ISeriesApi,
  PriceFormat,
  SeriesType,
  UTCTimestamp,
} from 'lightweight-charts'

import { DOWN, UP } from '@/lib/chart-model'
import type { ChartLine, ChartModel, Format } from '@/lib/chart-model'
import type { Candle } from '@/lib/dex'
import { formatAmount, formatPrice, pricePrecision } from '@/lib/format'
import { cn } from '@/lib/utils'

// lightweight-charts draws on canvas, so it needs concrete colours rather than CSS variables.
const GRID = 'rgba(20, 110, 120, 0.09)'
const TEXT = '#5b6f78'
const LEVEL = 'rgba(91, 111, 120, 0.45)'

type Ohlc = Pick<Candle, 'open' | 'high' | 'low' | 'close' | 'volume'>
type Lib = typeof import('lightweight-charts')
type ProfileBar = {
  key: string
  top: number
  height: number
  up: number
  down: number
}
type Layout = {
  tops: Record<number, number>
  /** Volume-by-price bars along the right edge of the price pane. */
  profile: { right: number; height: number | null; bars: ProfileBar[] } | null
}

function priceFormat(format: Format, sample: number): PriceFormat {
  if (format === 'percent')
    return {
      type: 'custom',
      minMove: 0.01,
      formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`,
    }
  const precision =
    format === 'number' ? 2 : pricePrecision(Math.abs(sample) || 1)
  return { type: 'price', precision, minMove: 1 / 10 ** precision }
}

export function formatValue(format: Format, v: number) {
  if (format === 'percent') return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  if (format === 'number') return v.toFixed(2)
  return formatPrice(v)
}

/** Shape of the extra series; when it changes the series are rebuilt. */
function structureOf(lines: ChartLine[]) {
  return JSON.stringify(
    lines.map((l) => [
      l.key,
      l.kind,
      l.pane,
      l.scale,
      l.color,
      l.format,
      l.levels,
      l.width,
    ]),
  )
}

export function CandleChart({
  model,
  viewKey,
  loading,
  emptyText = 'No recent swaps in this pool yet.',
  className,
}: {
  model: ChartModel
  /** Changes when the pair, timeframe or comparison set changes, to reset the visible range. */
  viewKey: string
  loading?: boolean
  emptyText?: string
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const lib = useRef<Lib | null>(null)
  const chart = useRef<IChartApi | null>(null)
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null)
  const extras = useRef(new Map<string, ISeriesApi<SeriesType>>())
  const structure = useRef('')
  const fitted = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<Ohlc | null>(null)
  const [hoverValues, setHoverValues] = useState<Record<string, number> | null>(
    null,
  )
  const [layout, setLayout] = useState<Layout>({ tops: {}, profile: null })
  const paneTops = layout.tops
  // Bumped whenever the price scales may have moved, to re-place the volume profile.
  const [layoutTick, setLayoutTick] = useState(0)

  // Create the chart once, on the client.
  useEffect(() => {
    let disposed = false
    let frame = 0
    const relayout = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayoutTick((t) => t + 1))
    }
    const observer = new ResizeObserver(relayout)
    import('lightweight-charts').then((l) => {
      if (disposed || !el.current) return
      const c = l.createChart(el.current, {
        autoSize: true,
        layout: {
          background: { type: l.ColorType.Solid, color: 'transparent' },
          textColor: TEXT,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          attributionLogo: false,
          panes: { separatorColor: GRID, separatorHoverColor: GRID },
        },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        crosshair: { mode: l.CrosshairMode.Normal },
        rightPriceScale: { borderColor: GRID },
        leftPriceScale: { borderColor: GRID, visible: false },
        timeScale: {
          borderColor: GRID,
          timeVisible: true,
          secondsVisible: false,
        },
      })
      const cs = c.addSeries(l.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
      })
      cs.priceScale().applyOptions({
        scaleMargins: { top: 0.08, bottom: 0.24 },
      })
      const vs = c.addSeries(l.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      vs.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

      c.subscribeCrosshairMove((param) => {
        if (!param.time) {
          setHover(null)
          setHoverValues(null)
          return
        }
        const d = param.seriesData.get(cs) as Ohlc | undefined
        const v = param.seriesData.get(vs) as { value: number } | undefined
        setHover(d && 'open' in d ? { ...d, volume: v?.value ?? 0 } : null)
        const values: Record<string, number> = {}
        for (const [key, s] of extras.current) {
          const p = param.seriesData.get(s) as { value?: number } | undefined
          if (p?.value !== undefined) values[key] = p.value
        }
        setHoverValues(values)
      })
      c.timeScale().subscribeVisibleLogicalRangeChange(relayout)
      observer.observe(el.current)

      lib.current = l
      chart.current = c
      candleSeries.current = cs
      volumeSeries.current = vs
      setReady(true)
    })
    const series = extras.current
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      chart.current?.remove()
      chart.current = null
      series.clear()
    }
  }, [])

  // Redraw whenever data or settings change; only reset the zoom when the view changes.
  useEffect(() => {
    const c = chart.current
    const l = lib.current
    const cs = candleSeries.current
    const vs = volumeSeries.current
    if (!ready || !c || !l || !cs || !vs) return

    const main = model.main
    cs.applyOptions({
      visible: !!main,
      priceFormat: priceFormat(
        main?.format ?? 'price',
        main?.candles.at(-1)?.close ?? 1,
      ),
    })
    cs.setData(
      (main?.candles ?? []).map((k) => ({
        ...k,
        time: k.time as UTCTimestamp,
      })),
    )
    vs.applyOptions({ visible: !!model.volume })
    vs.setData(
      (model.volume ?? []).map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${UP}55` : `${DOWN}55`,
      })),
    )
    c.applyOptions({ leftPriceScale: { visible: model.leftScale } })

    const shape = structureOf(model.lines)
    if (shape !== structure.current) {
      structure.current = shape
      for (const s of extras.current.values()) c.removeSeries(s)
      extras.current.clear()
      for (const line of model.lines) {
        const common = {
          color: line.color,
          priceScaleId: line.scale,
          lastValueVisible: line.scale === 'right' || line.scale === 'left',
          priceLineVisible: false,
          priceFormat: priceFormat(line.format, line.data.at(-1)?.value ?? 1),
        }
        const s =
          line.kind === 'histogram'
            ? c.addSeries(l.HistogramSeries, common, line.pane)
            : c.addSeries(
                l.LineSeries,
                { ...common, lineWidth: line.width, crosshairMarkerRadius: 3 },
                line.pane,
              )
        if (line.scale.startsWith('cmp-') || line.scale.startsWith('ind-'))
          s.priceScale().applyOptions({
            scaleMargins: { top: 0.08, bottom: 0.24 },
          })
        for (const price of line.levels ?? [])
          s.createPriceLine({
            price,
            color: LEVEL,
            lineWidth: 1,
            lineStyle: l.LineStyle.Dashed,
            axisLabelVisible: false,
          })
        extras.current.set(line.key, s)
      }
      const panes = c.panes()
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1))
    }
    for (const line of model.lines) {
      const s = extras.current.get(line.key)
      s?.setData(
        line.data.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
          ...(p.color ? { color: p.color } : {}),
        })),
      )
    }

    const length = Math.max(
      main?.candles.length ?? 0,
      ...model.lines.map((x) => x.data.length),
    )
    if (fitted.current !== viewKey && length > 0) {
      fitted.current = viewKey
      c.timeScale().setVisibleLogicalRange({
        from: Math.max(-4, length - 120),
        to: length + 4,
      })
    }
    setLayoutTick((t) => t + 1)
  }, [ready, model, viewKey])

  // Where each indicator pane starts (for its label) and where the volume
  // profile bars sit. Measured from the chart after it lays out.
  useEffect(() => {
    const c = chart.current
    if (!ready || !c) return
    let top = 0
    const tops: Record<number, number> = {}
    c.panes().forEach((p, i) => {
      tops[i] = top
      top += p.getHeight() + 1
    })
    const height = tops[1] !== undefined ? tops[1] - 1 : null
    const bars: ProfileBar[] = []
    for (const p of model.profiles) {
      const series =
        p.seriesKey === 'main'
          ? candleSeries.current
          : extras.current.get(p.seriesKey)
      if (!series) continue
      const max = Math.max(...p.bins.map((x) => x.up + x.down), 0)
      if (!max) continue
      p.bins.forEach((x, i) => {
        const y1 = series.priceToCoordinate(x.high)
        const y2 = series.priceToCoordinate(x.low)
        if (y1 === null || y2 === null) return
        const barTop = Math.min(y1, y2)
        if (height !== null && barTop > height) return
        bars.push({
          key: `${p.key}:${i}`,
          top: barTop,
          height: Math.max(1, Math.abs(y2 - y1) - 1),
          up: x.up / max,
          down: x.down / max,
        })
      })
    }
    const next: Layout = {
      tops,
      profile: bars.length
        ? { right: c.priceScale('right').width(), height, bars }
        : null,
    }
    // Chart geometry is only known after the canvas lays out.
    setLayout((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    )
  }, [ready, layoutTick, model])

  const live = model.main?.candles.at(-1) ?? null
  const shown =
    hover ?? (live && { ...live, volume: model.volume?.at(-1)?.volume ?? 0 })
  const up = shown ? shown.close >= shown.open : true
  const mainFormat = model.main?.format ?? 'price'
  const valueOf = (line: ChartLine) =>
    hoverValues?.[line.key] ?? line.data.at(-1)?.value
  const byPane = useMemo(() => {
    const m = new Map<number, ChartLine[]>()
    for (const line of model.lines)
      m.set(line.pane, [...(m.get(line.pane) ?? []), line])
    return m
  }, [model.lines])
  const empty =
    !model.main?.candles.length && model.lines.every((x) => !x.data.length)

  return (
    <div className={cn('relative', className)}>
      <div className="num pointer-events-none absolute left-3 top-2 z-10 flex max-w-[calc(100%-6rem)] flex-col gap-0.5 text-[11px] text-muted-foreground">
        {shown && model.main && (
          <div className="flex flex-wrap gap-x-3">
            {(['open', 'high', 'low', 'close'] as const).map((k) => (
              <span key={k}>
                {k[0].toUpperCase()}{' '}
                <span className={up ? 'text-up' : 'text-down'}>
                  {formatValue(mainFormat, shown[k])}
                </span>
              </span>
            ))}
            <span>
              Vol{' '}
              <span className="text-foreground">
                {formatAmount(shown.volume)}
              </span>
            </span>
          </div>
        )}
        {(byPane.get(0) ?? []).map((line) => (
          <LegendItem key={line.key} line={line} value={valueOf(line)} />
        ))}
      </div>
      {Object.entries(model.panes).map(([pane, label]) => {
        const top = paneTops[Number(pane)]
        if (top === undefined) return null
        return (
          <div
            key={pane}
            style={{ top: top + 4 }}
            className="num pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-6rem)] flex-wrap gap-x-3 text-[11px] text-muted-foreground"
          >
            <span className="text-foreground">{label}</span>
            {(byPane.get(Number(pane)) ?? []).map((line) => (
              <span
                key={line.key}
                style={{ color: line.kind === 'line' ? line.color : undefined }}
              >
                {line.label.split(' · ')[0]}{' '}
                {valueOf(line) !== undefined
                  ? formatValue(line.format, valueOf(line)!)
                  : '—'}
              </span>
            ))}
          </div>
        )
      })}
      <div ref={el} className="absolute inset-0" />
      {layout.profile && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 overflow-hidden"
          style={{
            right: layout.profile.right,
            height: layout.profile.height ?? '100%',
          }}
        >
          {layout.profile.bars.map((x) => (
            <div
              key={x.key}
              className="absolute right-0 flex"
              style={{
                top: x.top,
                height: x.height,
                width: `${(x.up + x.down) * 28}%`,
              }}
            >
              <div style={{ flex: x.down, background: `${DOWN}33` }} />
              <div style={{ flex: x.up, background: `${UP}40` }} />
            </div>
          ))}
        </div>
      )}
      {(!ready || loading) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading swaps from the chain…
        </div>
      )}
      {ready && !loading && empty && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  )
}

function LegendItem({
  line,
  value,
}: {
  line: ChartLine
  value: number | undefined
}) {
  return (
    <span className="flex items-center gap-1.5 truncate">
      <span
        aria-hidden
        className="inline-block h-0.5 w-3 shrink-0 rounded"
        style={{ background: line.color }}
      />
      <span className="truncate">{line.label}</span>
      <span className="text-foreground">
        {value !== undefined ? formatValue(line.format, value) : '—'}
      </span>
    </span>
  )
}
