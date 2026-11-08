import { Link } from '@tanstack/react-router'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Change } from '@/components/dex/change'
import { PairIcon } from '@/components/dex/token-icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { poolPrice } from '@/lib/dex'
import type { Market, Mover } from '@/lib/dex'
import { formatPrice } from '@/lib/format'
import { getMovers } from '@/lib/koindx.functions'
import { cn } from '@/lib/utils'

const SHOW = 5
const REFRESH_MS = 60_000

/** Top gainers and losers over 24h, loaded after hydration since it's time-based. */
export function TopMovers({ market }: { market: Market }) {
  const [movers, setMovers] = useState<Mover[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      getMovers()
        .then((m) => {
          if (!alive) return
          setMovers(m)
          setError(false)
        })
        .catch(() => {
          if (alive) setError(true)
        })
    void load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [attempt])

  const known = (movers ?? []).filter((m) =>
    market.pools.some((p) => p.id === m.pool),
  )
  const gainers = known
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, SHOW)
  const losers = known
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, SHOW)

  return (
    <section
      aria-labelledby="movers-heading"
      className="mx-auto max-w-content px-4 pt-12"
    >
      <div className="mb-5">
        <h2 id="movers-heading" className="font-display text-2xl font-semibold">
          Top movers
        </h2>
        <p className="text-sm text-muted-foreground">
          24h price change across the most liquid pools, from on-chain swaps.
        </p>
      </div>
      {error && !movers ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground"
        >
          Couldn’t load 24h price changes from the Koinos node.
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(false)
              setAttempt((a) => a + 1)
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <MoverList
            title="Top gainers"
            icon={<TrendingUp className="size-4 text-up" />}
            rows={movers && gainers}
            market={market}
            empty="No pool is up over the last 24 hours."
          />
          <MoverList
            title="Top losers"
            icon={<TrendingDown className="size-4 text-down" />}
            rows={movers && losers}
            market={market}
            empty="No pool is down over the last 24 hours."
          />
        </div>
      )}
    </section>
  )
}

function MoverList({
  title,
  icon,
  rows,
  market,
  empty,
}: {
  title: string
  icon: React.ReactNode
  rows: Mover[] | null
  market: Market
  empty: string
}) {
  return (
    <div className="rounded-xl border bg-card">
      <h3 className="flex items-center gap-2 border-b px-4 py-3 font-display font-semibold">
        {icon}
        {title}
      </h3>
      {rows === null ? (
        <ul aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
          {Array.from({ length: SHOW }, (_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
            >
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="ml-auto h-4 w-16" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ol>
          {rows.map((m, i) => {
            const pool = market.pools.find((p) => p.id === m.pool)!
            const base = market.tokens[pool.base]
            const quote = market.tokens[pool.quote]
            return (
              <li key={m.pool} className="border-b last:border-0">
                <Link
                  to="/trade/$pair"
                  params={{ pair: pool.slug }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50 motion-reduce:transition-none"
                >
                  <span className="num w-4 text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <PairIcon base={base} quote={quote} />
                  <span className="min-w-0">
                    <span className="block font-display font-semibold">
                      {base.symbol}
                      <span className="text-muted-foreground">
                        /{quote.symbol}
                      </span>
                    </span>
                    <span className="num block truncate text-xs text-muted-foreground">
                      {formatPrice(poolPrice(pool))} {quote.symbol} · {m.swaps}{' '}
                      {m.swaps === 1 ? 'swap' : 'swaps'}
                    </span>
                  </span>
                  <Change
                    value={m.change}
                    className={cn(
                      'ml-auto rounded-md px-2 py-1 text-sm font-medium',
                      m.change >= 0 ? 'bg-up/12' : 'bg-down/12',
                    )}
                  />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
