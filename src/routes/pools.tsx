import { Link, createFileRoute } from '@tanstack/react-router'
import { BadgeCheck, ExternalLink, Plus, Search } from 'lucide-react'
import { useState } from 'react'

import { SiteFooter, SiteHeader } from '@/components/dex/site-header'
import { PairIcon, TokenIcon } from '@/components/dex/token-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shortAddress } from '@/lib/dex'
import type { Pool, Token } from '@/lib/dex'
import { formatAmount, formatUsd } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/koinos'
import { useMarket } from '@/lib/use-market'

export const Route = createFileRoute('/pools')({
  head: () => ({ meta: [{ title: 'Liquidity pools · KoinFlow' }] }),
  component: PoolsPage,
})

const KOINDX_ADD = 'https://app.koindx.com/liquidity/add'
const PAGE = 40

function matches(t: Token, q: string) {
  return (
    t.symbol.toLowerCase().includes(q) ||
    t.name.toLowerCase().includes(q) ||
    t.address.toLowerCase() === q
  )
}

function PoolsPage() {
  const { market } = useMarket()
  const { tokens, pools } = market
  const [query, setQuery] = useState('')
  const [poolLimit, setPoolLimit] = useState(PAGE)
  const [tokenLimit, setTokenLimit] = useState(PAGE)

  const q = query.trim().toLowerCase()
  const shownPools = pools.filter(
    (p) => !q || matches(tokens[p.base], q) || matches(tokens[p.quote], q),
  )
  const depth = liquidityByToken(pools)
  const tokenList = Object.values(tokens)
    .filter((t) => !q || matches(t, q))
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        (depth[b.id] ?? 0) - (depth[a.id] ?? 0),
    )
  const swaps = pools.reduce((s, p) => s + p.txCount, 0)

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-content px-4 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Liquidity pools
            </h1>
            <p className="mt-1 text-muted-foreground">
              Every KoinDX constant-product pool with liquidity on Koinos.
              Provide liquidity to earn the 0.25% swap fee.
            </p>
          </div>
          <Button asChild>
            <a href={KOINDX_ADD} target="_blank" rel="noreferrer">
              <Plus /> New position
            </a>
          </Button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          <Kpi label="Total value locked" value={formatUsd(market.tvlUsd)} />
          <Kpi label="Volume (all time)" value={formatUsd(market.volumeUsd)} />
          <Kpi
            label="Live pools"
            value={pools.length.toLocaleString('en-US')}
          />
          <Kpi
            label="Swaps across pools"
            value={swaps.toLocaleString('en-US')}
          />
        </div>

        <div className="relative mt-8 mb-3 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPoolLimit(PAGE)
              setTokenLimit(PAGE)
            }}
            placeholder="Filter by token or address"
            className="pl-8"
            aria-label="Filter pools and tokens"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">Pool</th>
                <th className="px-4 py-3 font-medium">Reserves</th>
                <th className="px-4 py-3 text-right font-medium">TVL</th>
                <th className="px-4 py-3 text-right font-medium">
                  Volume (all time)
                </th>
                <th className="px-4 py-3 text-right font-medium">Swaps</th>
                <th className="px-4 py-3 text-right font-medium">LPs</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shownPools.slice(0, poolLimit).map((p) => {
                const base = tokens[p.base]
                const quote = tokens[p.quote]
                const baseUsd = p.baseReserve * base.usd
                const share =
                  p.tvlUsd > 0 ? Math.min(1, baseUsd / p.tvlUsd) : 0.5
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PairIcon base={base} quote={quote} />
                        <div>
                          <div className="font-display font-semibold">
                            {base.symbol}/{quote.symbol}
                          </div>
                          <a
                            href={`${EXPLORER_URL}/address/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="num text-[10px] text-muted-foreground hover:text-primary"
                          >
                            {shortAddress(p.id)}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="num text-xs">
                        {formatAmount(p.baseReserve)} {base.symbol}
                        <span className="text-muted-foreground"> · </span>
                        {formatAmount(p.quoteReserve)} {quote.symbol}
                      </div>
                      <div className="mt-1.5 flex h-1 w-40 overflow-hidden rounded-full">
                        <span
                          style={{
                            width: `${share * 100}%`,
                            background: base.color,
                          }}
                        />
                        <span
                          className="flex-1"
                          style={{ background: quote.color }}
                        />
                      </div>
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
                    <td className="num px-4 py-3 text-right">{p.lpCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/trade/$pair" params={{ pair: p.slug }}>
                            Trade
                          </Link>
                        </Button>
                        <Button size="sm" variant="secondary" asChild>
                          <a href={KOINDX_ADD} target="_blank" rel="noreferrer">
                            Add
                          </a>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {shownPools.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No pools match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shownPools.length > poolLimit && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setPoolLimit(shownPools.length)}
            >
              Show all {shownPools.length} pools
            </Button>
          </div>
        )}

        <h2 className="mt-12 mb-1 font-display text-xl font-semibold">
          Tokens
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {tokenList.length} tokens with live liquidity.{' '}
          <BadgeCheck className="inline size-3.5 text-primary" /> marks tokens
          in the curated KoinDX list.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tokenList.slice(0, tokenLimit).map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <TokenIcon token={t} className="size-6 text-[8px] ring-0" />
                <span className="truncate font-display font-semibold">
                  {t.symbol}
                </span>
                {t.verified && (
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-primary"
                    aria-label="Listed by KoinDX"
                  />
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {t.name}
              </div>
              <div className="num mt-3 text-sm">
                {t.usd ? formatUsd(t.usd, false) : '—'}
              </div>
              <a
                href={`${EXPLORER_URL}/address/${t.address}`}
                target="_blank"
                rel="noreferrer"
                className="num mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                {shortAddress(t.address)} <ExternalLink className="size-3" />
              </a>
            </div>
          ))}
        </div>
        {tokenList.length > tokenLimit && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setTokenLimit(tokenList.length)}
            >
              Show all {tokenList.length} tokens
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}

function liquidityByToken(pools: Pool[]) {
  const out: Record<string, number> = {}
  for (const p of pools) {
    out[p.base] = (out[p.base] ?? 0) + p.tvlUsd
    out[p.quote] = (out[p.quote] ?? 0) + p.tvlUsd
  }
  return out
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
