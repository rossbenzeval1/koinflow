import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ChevronDown, ExternalLink, Search, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FavoriteButton } from '@/components/dex/favorite-button'
import { CandleChart } from '@/components/dex/candle-chart'
import {
  CompareModeSwitch,
  ComparePicker,
  IndicatorPicker,
  pairLabel,
} from '@/components/dex/chart-controls'
import { Change } from '@/components/dex/change'
import { OrderBook } from '@/components/dex/order-book'
import { SiteHeader } from '@/components/dex/site-header'
import { SwapPanel } from '@/components/dex/swap-panel'
import { TradeTape } from '@/components/dex/trade-tape'
import { PairIcon } from '@/components/dex/token-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  TIMEFRAMES,
  buildCandles,
  findPool,
  poolPrice,
  shortAddress,
} from '@/lib/dex'
import type { Market, Pool, TimeframeId, Trade } from '@/lib/dex'
import {
  buildChartModel,
  invertCandles,
  sourceOptions,
} from '@/lib/chart-model'
import { formatAmount, formatPrice, formatUsd } from '@/lib/format'
import { getPoolTrades } from '@/lib/koindx.functions'
import { EXPLORER_URL } from '@/lib/koinos'
import { useChartSettings } from '@/lib/use-chart-settings'
import { useMarket } from '@/lib/use-market'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

export const Route = createFileRoute('/trade/$pair')({
  loader: async ({ params, parentMatchPromise }) => {
    const market = (await parentMatchPromise).loaderData
    const pool = market && findPool(market.pools, params.pair)
    if (!market || !pool) throw notFound()
    const name = `${market.tokens[pool.base].symbol}/${market.tokens[pool.quote].symbol}`
    return { poolId: pool.id, name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Trade'} · KoinFlow` }],
  }),
  component: TradePage,
})

function TradePage() {
  const { poolId } = Route.useLoaderData()
  const { market } = useMarket()
  const pool = market.pools.find((p) => p.id === poolId)
  if (!pool) throw notFound()
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* Keyed so every piece of live state resets when switching pairs. */}
      <Terminal key={pool.id} pool={pool} market={market} />
    </div>
  )
}

const DAY = 86_400_000

/** On-chain swaps for a pool, polled while the terminal is open. */
function usePoolTrades(pool: Pool, intervalMs = 12_000) {
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [error, setError] = useState(false)
  const [freshId, setFreshId] = useState<string>()
  // When the last snapshot arrived; read in the callback so SSR and hydration match.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const newest = useRef<string | null>(null)

  const load = useCallback(() => {
    return getPoolTrades({ data: { pool: pool.id } })
      .then((t) => {
        if (newest.current && t[0] && t[0].id !== newest.current)
          setFreshId(t[0].id)
        newest.current = t[0]?.id ?? null
        setTrades(t)
        setFetchedAt(Date.now())
        setError(false)
      })
      .catch(() => setError(true))
  }, [pool.id])

  useEffect(() => {
    load()
    const id = setInterval(load, intervalMs)
    return () => clearInterval(id)
  }, [load, intervalMs])

  return { trades, fetchedAt, error, freshId, reload: load }
}

/** Swaps for the comparison pairs, keyed by pool id and polled together. */
function useCompareTrades(ids: string[], intervalMs = 15_000) {
  const [trades, setTrades] = useState<Record<string, Trade[]>>({})
  const key = ids.join(',')

  useEffect(() => {
    if (!key) return
    let alive = true
    const load = () =>
      Promise.all(
        key.split(',').map((pool) =>
          getPoolTrades({ data: { pool } })
            .then((t) => [pool, t] as const)
            .catch(() => null),
        ),
      ).then((rows) => {
        if (!alive) return
        setTrades((prev) => {
          const next = { ...prev }
          for (const r of rows) if (r) next[r[0]] = r[1]
          return next
        })
      })
    load()
    const id = setInterval(load, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [key, intervalMs])

  return trades
}

function Terminal({ pool, market }: { pool: Pool; market: Market }) {
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h')
  const [tab, setTab] = useState<'trades' | 'pool' | 'orders'>('trades')
  const { trades, fetchedAt: now, error, freshId, reload } = usePoolTrades(pool)
  const wallet = useWallet()

  const base = market.tokens[pool.base]
  const quote = market.tokens[pool.quote]
  const price = poolPrice(pool)
  const candles = useMemo(
    () => buildCandles(trades ?? [], timeframe),
    [trades, timeframe],
  )

  // Comparison pairs, ratios and indicators layered on the chart.
  const [chartSettings, updateChart] = useChartSettings()
  const compares = useMemo(
    () =>
      chartSettings.compares.filter(
        (c) => c.pool !== pool.id && market.pools.some((p) => p.id === c.pool),
      ),
    [chartSettings.compares, pool.id, market.pools],
  )
  const compareTrades = useCompareTrades(compares.map((c) => c.pool))
  const primaryLabel = pairLabel(market, pool)
  const compareSeries = useMemo(
    () =>
      compares.map((c) => {
        const p = market.pools.find((x) => x.id === c.pool)!
        const built = buildCandles(compareTrades[c.pool] ?? [], timeframe)
        return {
          pool: c.pool,
          label: pairLabel(market, p, c.invert),
          candles: c.invert ? invertCandles(built) : built,
          loaded: c.pool in compareTrades,
        }
      }),
    [compares, compareTrades, timeframe, market],
  )
  const chartModel = useMemo(
    () =>
      buildChartModel({
        primary: { pool: pool.id, label: primaryLabel, candles },
        compares: compareSeries,
        mode: chartSettings.mode,
        indicators: chartSettings.indicators,
        intraday:
          (TIMEFRAMES.find((t) => t.id === timeframe)?.seconds ?? Infinity) <
          86_400,
      }),
    [pool.id, primaryLabel, candles, compareSeries, chartSettings, timeframe],
  )
  const sources = useMemo(
    () => sourceOptions({ label: primaryLabel }, compareSeries),
    [primaryLabel, compareSeries],
  )
  const comparing = compareSeries.length > 0
  const ratioMode = comparing && chartSettings.mode === 'ratio'
  const compareLoading = compareSeries.some((c) => !c.loaded)

  const last = trades?.[0]
  const dir = last ? (last.side === 'buy' ? 1 : -1) : 0

  // 24h stats from decoded swaps; `day` is null until history covers a full day.
  const day = useMemo(() => {
    if (!trades?.length || now === null) return null
    const since = now - DAY
    const recent = trades.filter((t) => t.time >= since)
    const before = trades.find((t) => t.time < since)
    const open = before?.mid ?? null
    const mids = recent.map((t) => t.mid)
    return {
      change: open ? ((price - open) / open) * 100 : null,
      high: mids.length ? Math.max(...mids, price) : null,
      low: mids.length ? Math.min(...mids, price) : null,
      volume: recent.reduce((s, t) => s + t.amount, 0),
      count: recent.length,
    }
  }, [trades, price, now])

  const mine = useMemo(
    () =>
      wallet.address
        ? (trades ?? []).filter((t) => t.account === wallet.address)
        : [],
    [trades, wallet.address],
  )

  return (
    <main className="flex flex-1 flex-col gap-px bg-border">
      {/* Pair header */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <PairPicker pool={pool} market={market} />
          <FavoriteButton
            pool={pool.id}
            label={`${base.symbol}/${quote.symbol}`}
          />
        </div>

        <div>
          <div
            className={cn(
              'num text-xl font-semibold',
              dir >= 0 ? 'text-up' : 'text-down',
            )}
          >
            {formatPrice(price)}
          </div>
          <div className="num text-xs text-muted-foreground">
            ≈ {formatUsd(price * quote.usd, false)}
          </div>
        </div>
        <HeaderStat label="24h change">
          {day?.change != null ? <Change value={day.change} /> : '—'}
        </HeaderStat>
        <HeaderStat label="24h high">
          {day?.high != null ? formatPrice(day.high) : '—'}
        </HeaderStat>
        <HeaderStat label="24h low">
          {day?.low != null ? formatPrice(day.low) : '—'}
        </HeaderStat>
        <HeaderStat label={`24h volume (${base.symbol})`}>
          {day ? formatAmount(day.volume) : '—'}
        </HeaderStat>
        <HeaderStat label="Liquidity">{formatUsd(pool.tvlUsd)}</HeaderStat>
        <HeaderStat label="Swaps (all time)">
          {pool.txCount.toLocaleString('en-US')}
        </HeaderStat>
      </div>

      <div className="grid flex-1 gap-px lg:grid-cols-[minmax(0,1fr)_260px_340px]">
        {/* Chart */}
        <section className="flex min-h-[460px] flex-col bg-background">
          <div className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeframe(t.id)}
                aria-pressed={timeframe === t.id}
                aria-label={`${t.id === '1w' ? 'Weekly' : t.id === '1M' ? 'Monthly' : t.label} candles`}
                className={cn(
                  'num rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground',
                  timeframe === t.id && 'bg-secondary text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <ComparePicker
              pool={pool}
              market={market}
              settings={chartSettings}
              update={updateChart}
            />
            <CompareModeSwitch
              settings={chartSettings}
              update={updateChart}
              hasCompares={comparing}
            />
            <IndicatorPicker
              settings={chartSettings}
              update={updateChart}
              sources={sources}
            />
            <span className="ml-auto hidden text-[11px] text-muted-foreground xl:block">
              {error
                ? 'Could not reach the Koinos node, retrying…'
                : `Candles from the last ${trades?.length ?? '…'} on-chain swaps`}
            </span>
          </div>
          {(timeframe === '1w' || timeframe === '1M') && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              {timeframe === '1w'
                ? 'Weeks start Monday (UTC).'
                : 'Calendar months start on the 1st (UTC).'}{' '}
              Recent swaps only; older history and the first candle may be
              incomplete.
            </p>
          )}
          {chartModel.notes.length > 0 && (
            <ul className="space-y-0.5 px-4 py-1.5 text-xs text-muted-foreground">
              {chartModel.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <CandleChart
            model={chartModel}
            viewKey={`${pool.id}:${timeframe}:${chartSettings.mode}:${compares.map((c) => c.pool).join(',')}`}
            loading={trades === null || (ratioMode && compareLoading)}
            emptyText={
              ratioMode
                ? 'No overlapping swap history between these pairs yet.'
                : 'No recent swaps in this pool yet.'
            }
            className={cn(
              'flex-1',
              Object.keys(chartModel.panes).length > 0
                ? 'min-h-[560px]'
                : 'min-h-[420px]',
            )}
          />
        </section>

        {/* Order book */}
        <section className="hidden bg-background lg:block">
          <PanelTitle>Depth</PanelTitle>
          <div className="h-[calc(100%-37px)]">
            <OrderBook
              pool={pool}
              base={base}
              quote={quote}
              price={price}
              dir={dir}
            />
          </div>
        </section>

        {/* Swap */}
        <section className="bg-background lg:row-span-2">
          <PanelTitle>Swap</PanelTitle>
          <SwapPanel
            pool={pool}
            base={base}
            quote={quote}
            price={price}
            onSwapped={reload}
          />
        </section>

        {/* Bottom tabs */}
        <section className="bg-background lg:col-span-2">
          <div className="flex gap-4 border-b px-3">
            {(
              [
                ['trades', 'Recent swaps'],
                ['pool', 'Pool info'],
                ['orders', 'My swaps'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px border-b-2 border-transparent py-2 text-xs font-medium text-muted-foreground',
                  tab === id && 'border-primary text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="h-64">
            {tab === 'trades' &&
              (trades === null ? (
                <Empty>Loading swaps from the chain…</Empty>
              ) : trades.length === 0 ? (
                <Empty>No recent swaps in this pool.</Empty>
              ) : (
                <TradeTape
                  base={base}
                  quote={quote}
                  trades={trades}
                  freshId={freshId}
                />
              ))}
            {tab === 'pool' && (
              <div className="grid gap-6 overflow-y-auto p-4 text-sm sm:grid-cols-2">
                {[base, quote].map((t) => (
                  <div key={t.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2 font-display font-semibold">
                      {t.name}{' '}
                      <span className="text-muted-foreground">{t.symbol}</span>
                    </div>
                    <InfoRow label="Pool reserve">
                      {formatAmount(
                        t.id === pool.base
                          ? pool.baseReserve
                          : pool.quoteReserve,
                      )}
                    </InfoRow>
                    <InfoRow label="USD price">
                      {t.usd ? formatUsd(t.usd, false) : '—'}
                    </InfoRow>
                    <InfoRow label="Contract">
                      <ExplorerLink address={t.address} />
                    </InfoRow>
                  </div>
                ))}
                <div className="rounded-lg border p-4 sm:col-span-2">
                  <InfoRow label="Pair contract">
                    <ExplorerLink address={pool.id} />
                  </InfoRow>
                  <InfoRow label="Swap fee">{pool.feeBps / 100}%</InfoRow>
                  <InfoRow label="Liquidity providers">{pool.lpCount}</InfoRow>
                  <InfoRow label="Volume (all time)">
                    {formatUsd(pool.volumeUsd)}
                  </InfoRow>
                </div>
              </div>
            )}
            {tab === 'orders' &&
              (!wallet.address ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Wallet className="size-6" />
                  Connect Kondor to see your swaps in this pool.
                  <Button size="sm" variant="outline" onClick={wallet.connect}>
                    Connect Kondor
                  </Button>
                </div>
              ) : mine.length === 0 ? (
                <Empty>
                  No swaps from {shortAddress(wallet.address)} among the recent
                  swaps in this pool.
                </Empty>
              ) : (
                <TradeTape
                  base={base}
                  quote={quote}
                  trades={mine}
                  sizeTrades={trades ?? mine}
                />
              ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function PairPicker({ pool, market }: { pool: Pool; market: Market }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { tokens } = market
  const q = query.trim().toLowerCase()
  const list = market.pools
    .filter(
      (p) =>
        !q ||
        [tokens[p.base], tokens[p.quote]].some(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q),
        ),
    )
    .slice(0, 60)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-secondary">
        <PairIcon base={tokens[pool.base]} quote={tokens[pool.quote]} />
        <span className="font-display text-xl font-bold">
          {tokens[pool.base].symbol}
          <span className="text-muted-foreground">
            /{tokens[pool.quote].symbol}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${market.pools.length} pools`}
            className="pl-8"
            aria-label="Search pools"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {list.map((p) => (
            <Link
              key={p.id}
              to="/trade/$pair"
              params={{ pair: p.slug }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            >
              <PairIcon
                base={tokens[p.base]}
                quote={tokens[p.quote]}
                className="scale-75"
              />
              <span className="font-medium">
                {tokens[p.base].symbol}/{tokens[p.quote].symbol}
              </span>
              <span className="num ml-auto text-xs text-muted-foreground">
                {formatUsd(p.tvlUsd)}
              </span>
            </Link>
          ))}
          {list.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No pools match “{query}”.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ExplorerLink({ address }: { address: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 hover:text-primary"
    >
      {shortAddress(address)} <ExternalLink className="size-3" />
    </a>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function HeaderStat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num text-sm">{children}</div>
    </div>
  )
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{children}</span>
    </div>
  )
}
