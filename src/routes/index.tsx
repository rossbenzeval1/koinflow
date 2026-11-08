import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Droplets,
  Layers,
  Search,
  Zap,
} from 'lucide-react'
import { useState } from 'react'

import {
  SiteFooter,
  SiteHeader,
  BlockStatus,
} from '@/components/dex/site-header'
import { FavoriteButton } from '@/components/dex/favorite-button'
import { useWatchlist } from '@/lib/watchlist'
import { useWallet } from '@/lib/wallet'
import { PairIcon } from '@/components/dex/token-icon'
import { TopMovers } from '@/components/dex/top-movers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DEFAULT_PAIR, poolPrice } from '@/lib/dex'
import { formatAmount, formatPrice, formatUsd } from '@/lib/format'
import { useMarket } from '@/lib/use-market'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Home,
})

type SortKey = 'tvl' | 'mcap' | 'volume' | 'swaps'
const PAGE = 50

function Home() {
  const { market, dirs } = useMarket()
  const { tokens, pools } = market
  const navigate = useNavigate()
  const watchlist = useWatchlist()
  const wallet = useWallet()
  const [watchOnly, setWatchOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('tvl')
  const [limit, setLimit] = useState(PAGE)

  const q = query.trim().toLowerCase()
  const rows = pools
    .filter((p) => !watchOnly || watchlist.favorites.includes(p.id))
    .filter(
      (p) =>
        !q ||
        [tokens[p.base], tokens[p.quote]].some(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.toLowerCase() === q,
        ),
    )
    .sort((a, b) =>
      sort === 'tvl'
        ? b.tvlUsd - a.tvlUsd
        : sort === 'mcap'
          ? (tokens[b.base].marketCapUsd ?? -1) -
              (tokens[a.base].marketCapUsd ?? -1) || b.tvlUsd - a.tvlUsd
          : sort === 'volume'
            ? b.volumeUsd - a.volumeUsd
            : b.txCount - a.txCount,
    )
  const deepest = pools.slice(0, 3)

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="grid-glow border-b">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <BlockStatus className="mb-6 w-fit bg-background/60" />
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Every Koinos market.
              <br />
              <span className="text-primary">One live terminal.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              All {Object.keys(tokens).length} tokens trading in {pools.length}{' '}
              KoinDX liquidity pools, with candlesticks and a trade tape decoded
              from on-chain swaps. Connect Kondor to swap without gas fees.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/trade/$pair" params={{ pair: DEFAULT_PAIR }}>
                  Start trading <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pools">
                  <Droplets /> Explore pools
                </Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-xl grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Total liquidity" value={formatUsd(market.tvlUsd)} />
              <Stat
                label="Volume (all time)"
                value={formatUsd(market.volumeUsd)}
              />
              <Stat label="Live pools" value={String(pools.length)} />
              <Stat label="Tokens" value={String(Object.keys(tokens).length)} />
            </dl>
          </div>

          <div className="grid gap-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Deepest pools · KOIN {formatUsd(market.koinUsd, false)}
            </p>
            {deepest.map((p) => (
              <Link
                key={p.id}
                to="/trade/$pair"
                params={{ pair: p.slug }}
                className="group flex items-center gap-4 rounded-xl border bg-card/70 p-4 backdrop-blur transition-colors hover:border-primary/50"
              >
                <PairIcon base={tokens[p.base]} quote={tokens[p.quote]} />
                <div className="min-w-0">
                  <div className="font-display font-semibold">
                    {tokens[p.base].symbol}
                    <span className="text-muted-foreground">
                      /{tokens[p.quote].symbol}
                    </span>
                  </div>
                  <div className="num text-sm text-muted-foreground">
                    {formatPrice(poolPrice(p))} {tokens[p.quote].symbol}
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className="num text-sm">{formatUsd(p.tvlUsd)}</div>
                  <div className="text-xs text-muted-foreground">liquidity</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <TopMovers market={market} />

      <section className="mx-auto max-w-content px-4 py-12">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Markets</h2>
            <p className="text-sm text-muted-foreground">
              Every KoinDX pool with liquidity on Koinos mainnet, refreshed
              every 15 seconds.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setLimit(PAGE)
                }}
                placeholder="Search token or address"
                className="w-56 pl-8"
                aria-label="Search markets"
              />
            </div>
            <div className="flex rounded-md border p-0.5">
              {(['tvl', 'mcap', 'volume', 'swaps'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  aria-pressed={sort === k}
                  className={cn(
                    'rounded px-2.5 text-xs capitalize text-muted-foreground',
                    sort === k && 'bg-secondary text-foreground',
                  )}
                >
                  {k === 'tvl' ? 'TVL' : k === 'mcap' ? 'Market cap' : k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={!watchOnly ? 'secondary' : 'ghost'}
            aria-pressed={!watchOnly}
            onClick={() => {
              setWatchOnly(false)
              setLimit(PAGE)
            }}
          >
            All markets
          </Button>
          <Button
            size="sm"
            variant={watchOnly ? 'secondary' : 'ghost'}
            aria-pressed={watchOnly}
            onClick={() => {
              setWatchOnly(true)
              setLimit(PAGE)
            }}
          >
            Watchlist {watchlist.ready ? `(${watchlist.favorites.length})` : ''}
          </Button>
          <span className="text-xs text-muted-foreground">
            Favorites follow your Kondor wallet.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={watchlist.busy || wallet.connecting}
            onClick={() => void watchlist.unlock()}
          >
            {watchlist.busy
              ? 'Syncing…'
              : !wallet.address
                ? 'Connect Kondor'
                : watchlist.error
                  ? 'Retry watchlist'
                  : watchlist.ready
                    ? 'Refresh watchlist'
                    : 'Verify wallet & load watchlist'}
          </Button>
        </div>
        {wallet.address && watchlist.status && (
          <p
            role={watchlist.error ? 'alert' : 'status'}
            className="mb-3 text-sm text-muted-foreground"
          >
            {watchlist.status}
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-3 font-medium">
                  <span className="sr-only">Watchlist</span>
                </th>
                <th className="px-4 py-3 font-medium">Pair</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">
                  Price (USD)
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
                      Market cap
                    </TooltipTrigger>
                    <TooltipContent>
                      Base token's on-chain total supply × its USD price
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th className="px-4 py-3 text-right font-medium">Liquidity</th>
                <th className="px-4 py-3 text-right font-medium">
                  Volume (all time)
                </th>
                <th className="px-4 py-3 text-right font-medium">Swaps</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((p) => {
                const base = tokens[p.base]
                const quote = tokens[p.quote]
                const price = poolPrice(p)
                const dir = dirs[p.id]
                return (
                  <tr
                    key={p.id}
                    onClick={() =>
                      navigate({ to: '/trade/$pair', params: { pair: p.slug } })
                    }
                    className="cursor-pointer border-b last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-2 py-3">
                      <FavoriteButton
                        pool={p.id}
                        label={`${base.symbol}/${quote.symbol}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/trade/$pair"
                        params={{ pair: p.slug }}
                        className="flex items-center gap-3"
                      >
                        <PairIcon base={base} quote={quote} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-display font-semibold">
                            {base.symbol}
                            <span className="text-muted-foreground">
                              /{quote.symbol}
                            </span>
                            {base.verified && (
                              <BadgeCheck
                                className="size-3.5 text-primary"
                                aria-label="Listed by KoinDX"
                              />
                            )}
                          </span>
                          <span className="block max-w-56 truncate text-xs text-muted-foreground">
                            {base.name} · {p.feeBps / 100}% fee
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td
                      key={price}
                      className={cn(
                        'num px-4 py-3 text-right',
                        dir === 1 && 'flash-up',
                        dir === -1 && 'flash-down',
                      )}
                    >
                      {formatPrice(price)}
                    </td>
                    <td className="num px-4 py-3 text-right text-muted-foreground">
                      {base.usd ? formatUsd(base.usd, false) : '—'}
                    </td>
                    <td
                      className="num px-4 py-3 text-right"
                      title={
                        base.supply !== null
                          ? `${formatAmount(base.supply)} ${base.symbol} total supply`
                          : undefined
                      }
                    >
                      {base.marketCapUsd !== null
                        ? formatUsd(base.marketCapUsd)
                        : '—'}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {formatUsd(p.tvlUsd)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {formatUsd(p.volumeUsd)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {p.txCount.toLocaleString('en-US')}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    {watchOnly && !watchlist.ready
                      ? watchlist.busy
                        ? 'Loading your watchlist…'
                        : 'Connect and verify your Kondor wallet to load your favorite pairs.'
                      : watchOnly && !query
                        ? 'Your watchlist is empty. Star a pair in All markets to add it.'
                        : `No ${watchOnly ? 'favorite pairs' : 'markets'} match “${query}”.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => setLimit(rows.length)}>
              Show all {rows.length} pools
            </Button>
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-content gap-4 px-4 pb-16 md:grid-cols-3">
        <Feature
          icon={<Zap className="size-5" />}
          title="On-chain candlesticks"
          body="Candles and the trade tape are decoded from each pool's swap events on Koinos, from 1 minute to calendar months, using available recent swaps."
        />
        <Feature
          icon={<Layers className="size-5" />}
          title="Every pool on-chain"
          body="Markets come from every KoinDX pair contract with liquidity, so new tokens show up as soon as a pool is seeded."
        />
        <Feature
          icon={<Droplets className="size-5" />}
          title="Feeless with Mana"
          body="Koinos replaces gas with regenerating Mana, so swaps cost nothing beyond the pool fee."
        />
      </section>

      <SiteFooter />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold">{value}</dd>
    </div>
  )
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
        {icon}
      </div>
      <h3 className="font-display font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
