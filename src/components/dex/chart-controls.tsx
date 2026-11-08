import {
  ArrowLeftRight,
  ChartLine,
  Layers,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { PairIcon } from '@/components/dex/token-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  COMPARE_COLORS,
  MAX_COMPARES,
  MAX_INDICATORS,
  compareModes,
} from '@/lib/chart-model'
import type { ChartSettings, SourceOption } from '@/lib/chart-model'
import type { Market, Pool } from '@/lib/dex'
import { formatUsd } from '@/lib/format'
import {
  INDICATORS,
  defaultParams,
  indicatorDef,
  indicatorLabel,
  resolveParams,
} from '@/lib/indicators'
import type { ParamDef } from '@/lib/indicators'
import { cn } from '@/lib/utils'

type Update = (fn: (s: ChartSettings) => ChartSettings) => void

export function pairLabel(market: Market, pool: Pool, invert = false) {
  const b = market.tokens[pool.base]?.symbol ?? '?'
  const q = market.tokens[pool.quote]?.symbol ?? '?'
  return invert ? `${q}/${b}` : `${b}/${q}`
}

/** Overlay / % change / ratio switch, enabled once a comparison pair is added. */
export function CompareModeSwitch({
  settings,
  update,
  hasCompares,
}: {
  settings: ChartSettings
  update: Update
  hasCompares: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Comparison mode"
      className="flex rounded-md border p-0.5"
    >
      {compareModes.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.hint}
          disabled={!hasCompares && m.id !== 'overlay'}
          aria-pressed={settings.mode === m.id}
          onClick={() => update((s) => ({ ...s, mode: m.id }))}
          className={cn(
            'rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground',
            settings.mode === m.id &&
              hasCompares &&
              'bg-secondary text-foreground',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

export function ComparePicker({
  pool,
  market,
  settings,
  update,
}: {
  pool: Pool
  market: Market
  settings: ChartSettings
  update: Update
}) {
  const [query, setQuery] = useState('')
  const compares = settings.compares.filter((c) => c.pool !== pool.id)
  const full = compares.length >= MAX_COMPARES
  const q = query.trim().toLowerCase()
  const taken = new Set([pool.id, ...compares.map((c) => c.pool)])
  const list = market.pools
    .filter((p) => !taken.has(p.id))
    .filter(
      (p) =>
        !q ||
        [market.tokens[p.base], market.tokens[p.quote]].some(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q),
        ),
    )
    .slice(0, 40)

  const add = (id: string) =>
    update((s) => ({
      ...s,
      compares: [
        ...s.compares.filter((c) => c.pool !== pool.id),
        { pool: id, invert: false },
      ].slice(0, MAX_COMPARES),
    }))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs">
          <ArrowLeftRight />
          Compare
          {compares.length > 0 && (
            <span className="num rounded bg-secondary px-1">
              {compares.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Compare pairs</p>
          <p className="text-xs text-muted-foreground">
            Up to {MAX_COMPARES} pairs. Flip a pair to quote it the other way
            round, e.g. KOIN per VHP.
          </p>
        </div>
        {compares.length > 0 && (
          <ul className="space-y-1 border-b p-2">
            {compares.map((c, i) => {
              const p = market.pools.find((x) => x.id === c.pool)
              return (
                <li key={c.pool} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: COMPARE_COLORS[i] }}
                  />
                  <span className="flex-1 truncate font-medium">
                    {p ? pairLabel(market, p, c.invert) : 'Unlisted pool'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Flip ${p ? pairLabel(market, p, c.invert) : 'pair'}`}
                    aria-pressed={c.invert}
                    title="Flip base and quote"
                    onClick={() =>
                      update((s) => ({
                        ...s,
                        compares: s.compares.map((x) =>
                          x.pool === c.pool ? { ...x, invert: !x.invert } : x,
                        ),
                      }))
                    }
                  >
                    <ArrowLeftRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${p ? pairLabel(market, p, c.invert) : 'pair'}`}
                    onClick={() =>
                      update((s) => ({
                        ...s,
                        compares: s.compares.filter((x) => x.pool !== c.pool),
                        indicators: s.indicators.filter(
                          (ind) => !ind.source.endsWith(`:${c.pool}`),
                        ),
                      }))
                    }
                  >
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {full ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Remove a pair to add another.
          </p>
        ) : (
          <>
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pairs to compare"
                className="h-8 pl-8"
                aria-label="Search pairs to compare"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                >
                  <PairIcon
                    base={market.tokens[p.base]}
                    quote={market.tokens[p.quote]}
                    className="scale-75"
                  />
                  <span className="font-medium">{pairLabel(market, p)}</span>
                  <span className="num ml-auto text-xs text-muted-foreground">
                    {formatUsd(p.tvlUsd)}
                  </span>
                </button>
              ))}
              {list.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No pairs match “{query}”.
                </p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function IndicatorPicker({
  settings,
  update,
  sources,
}: {
  settings: ChartSettings
  update: Update
  /** Pair and ratio sources currently on the chart. */
  sources: SourceOption[]
}) {
  const list = settings.indicators
  const full = list.length >= MAX_INDICATORS

  const add = (type: string) => {
    const def = indicatorDef(type)!
    update((s) => ({
      ...s,
      indicators: [
        ...s.indicators,
        {
          id: Math.random().toString(36).slice(2, 8),
          type,
          source: 'primary',
          params: defaultParams(def),
        },
      ].slice(0, MAX_INDICATORS),
    }))
  }
  const patch = (id: string, change: Partial<(typeof list)[number]>) =>
    update((s) => ({
      ...s,
      indicators: s.indicators.map((i) =>
        i.id === id ? { ...i, ...change } : i,
      ),
    }))
  const remove = (id: string) =>
    update((s) => ({
      ...s,
      // Indicators chained from this one go with it.
      indicators: s.indicators.filter(
        (i) => i.id !== id && i.source !== `ind:${id}`,
      ),
    }))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs">
          <ChartLine />
          Indicators
          {list.length > 0 && (
            <span className="num rounded bg-secondary px-1">{list.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Indicators</p>
          <p className="text-xs text-muted-foreground">
            Run any indicator on this pair, a comparison pair, a ratio, or
            another indicator — e.g. RSI of a ratio, or an SMA of that RSI.
          </p>
        </div>
        {list.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto border-b p-2">
            {list.map((ind, index) => {
              const def = indicatorDef(ind.type)!
              const params = resolveParams(def, ind.params)
              // Only earlier indicators can feed this one, so chains never loop.
              const options = [
                ...sources.filter((s) => !def.needsVolume || s.hasVolume),
                ...(def.needsVolume
                  ? []
                  : list.slice(0, index).flatMap((prev) => {
                      const pd = indicatorDef(prev.type)
                      if (!pd || pd.placement === 'profile') return []
                      return [
                        {
                          key: `ind:${prev.id}`,
                          label: indicatorLabel(
                            pd,
                            resolveParams(pd, prev.params),
                          ),
                          hasVolume: false,
                        },
                      ]
                    })),
              ]
              const known = options.some((o) => o.key === ind.source)
              return (
                <li key={ind.id} className="rounded-md border p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="flex-1 text-sm font-medium"
                      title={def.description}
                    >
                      {def.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${indicatorLabel(def, params)}`}
                      onClick={() => remove(ind.id)}
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
                      Source
                      <Select
                        value={known ? ind.source : undefined}
                        onValueChange={(v) => patch(ind.id, { source: v })}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-7 w-full min-w-0 text-xs text-foreground"
                        >
                          <SelectValue placeholder="Source removed — pick one" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem
                              key={o.key}
                              value={o.key}
                              className="text-xs"
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    {def.params.map((p) => (
                      <ParamInput
                        key={p.key}
                        param={p}
                        value={params[p.key]}
                        onChange={(v) =>
                          patch(ind.id, {
                            params: { ...ind.params, [p.key]: v },
                          })
                        }
                      />
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="p-2">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Layers className="size-3" /> Add
          </p>
          <div className="grid grid-cols-2 gap-1">
            {INDICATORS.map((d) => (
              <button
                key={d.type}
                type="button"
                disabled={full}
                onClick={() => add(d.type)}
                title={d.description}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-3 text-muted-foreground" />
                {d.name}
              </button>
            ))}
          </div>
          {full && (
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              Up to {MAX_INDICATORS} indicators at once.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: ParamDef
  value: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="flex w-14 flex-col gap-1 text-[11px] text-muted-foreground">
      {param.label}
      <Input
        type="number"
        inputMode="numeric"
        min={param.min}
        max={param.max}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          if (
            e.target.value &&
            Number.isInteger(v) &&
            v >= param.min &&
            v <= param.max
          )
            onChange(v)
        }}
        onBlur={() => setDraft(null)}
        className="num h-7 px-1.5 text-xs"
      />
    </label>
  )
}
