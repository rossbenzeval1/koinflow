import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  decodeTrades,
  getHistory,
  getTotalSupply,
  getTxTimes,
} from '@/lib/chain-history'
import type { HistoryEntry } from '@/lib/chain-history'
import { FEE_BPS, dayChange, findPool, poolPrice } from '@/lib/dex'
import type { Market, Mover, Pool, Token, Trade } from '@/lib/dex'

const KOINDX_API = 'https://api.koindx.com'
const TOKEN_LIST =
  'https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json'

/** KoinDX ids `koin` and `vhp` are system names; these are their contracts. */
const SYSTEM_ADDRESSES: Record<string, string> = {
  koin: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
  vhp: '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq',
}
const STABLES = new Set(['VUSDT', 'VUSDC', 'USDT', 'USDC'])

/** Tokens verified by KoinFlow itself, on top of the KoinDX curated list. */
const LOCAL_TOKENS: z.infer<typeof listedToken>[] = [
  {
    address: '1Ee4FLRyLWEhmhGZzwiRe82yXtJmq5J7yJ',
    symbol: 'RLE',
    name: 'RL-ENERGY',
    logoURI: '/tokens/rle.jpg',
  },
]

const apiToken = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.coerce.number(),
  // Tokens without a priced pool come back as null.
  priceUSD: z.string().nullish(),
})
const apiPair = z.object({
  id: z.string(),
  token0: z.object({ id: z.string() }),
  token1: z.object({ id: z.string() }),
  reserve0: z.string(),
  reserve1: z.string(),
  reserveUSD: z.string(),
  volumeUSD: z.string(),
  volumeToken0: z.string().nullish(),
  volumeToken1: z.string().nullish(),
  txCount: z.number(),
  liquidityProviderCount: z.number(),
})
const apiProtocol = z.object({
  txCount: z.number(),
  totalVolumeUSD: z.string(),
  totalLiquidityUSD: z.string(),
  koinPriceUSD: z.string(),
})
const listedToken = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  logoURI: z.string().optional(),
  allowance: z.boolean().optional(),
})

async function getJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok)
    throw new Error(`Request to ${new URL(url).host} failed (${res.status})`)
  return res.json()
}

async function koindx<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
): Promise<z.infer<T>> {
  const json = await getJson(`${KOINDX_API}${path}`)
  if (!json.success) throw new Error(`KoinDX ${path} failed`)
  return schema.parse(json.result)
}

/** The API caps `pageSize` at 500, so list endpoints are read page by page using `meta.total`. */
const PAGE_SIZE = 500
const MAX_PAGES = 20

async function koindxAll<T extends z.ZodTypeAny>(
  path: string,
  item: T,
): Promise<z.infer<T>[]> {
  const out: z.infer<T>[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await getJson(
      `${KOINDX_API}${path}?page=${page}&pageSize=${PAGE_SIZE}`,
    )
    if (!json.success) throw new Error(`KoinDX ${path} failed`)
    const rows = z.array(item).parse(json.result)
    out.push(...rows)
    const total = Number(json.meta?.total)
    if (
      rows.length < PAGE_SIZE ||
      (Number.isFinite(total) && out.length >= total)
    )
      break
  }
  return out
}

/** Stable, readable colour per token for icons and reserve bars. */
function colorFor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue = h % 360
  const s = 0.75
  const l = 0.66
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const c =
      l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const special: Record<string, string> = { koin: '#3cc8c0', vhp: '#7cc4ff' }

/**
 * On-chain total supplies, read from each token contract's KCS-4
 * `total_supply`. Supplies move slowly, so they're cached far longer than
 * prices; a failed read is retried on the next market load.
 */
const SUPPLY_TTL = 10 * 60_000
const SUPPLY_CONCURRENCY = 16
const SUPPLY_TIMEOUT = 5_000
const supplyCache = new Map<string, { at: number; raw: bigint }>()

async function loadSupplies(addresses: string[]) {
  const now = Date.now()
  const stale = addresses.filter((a) => {
    const c = supplyCache.get(a)
    return !c || now - c.at > SUPPLY_TTL
  })
  // Bound the whole batch so a slow node never holds up prices.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SUPPLY_TIMEOUT)
  let next = 0
  const worker = async () => {
    while (next < stale.length && !ctrl.signal.aborted) {
      const address = stale[next++]
      try {
        const raw = await getTotalSupply(address, ctrl.signal)
        supplyCache.set(address, { at: Date.now(), raw })
      } catch {
        // Keep any older value; this token shows no market cap until it reads.
      }
    }
  }
  await Promise.all(Array.from({ length: SUPPLY_CONCURRENCY }, worker))
  clearTimeout(timer)
  return new Map(
    addresses.flatMap((a) => {
      const c = supplyCache.get(a)
      return c ? [[a, c.raw] as const] : []
    }),
  )
}

async function loadMarket(): Promise<Market> {
  const [tokens, pairs, protocol, list] = await Promise.all([
    koindxAll('/v2/tokens', apiToken),
    koindxAll('/v2/pairs', apiPair),
    koindx('/v2/protocol', apiProtocol),
    // The curated list only adds names and logos, so the market still loads without it.
    getJson(TOKEN_LIST)
      .then((j) => z.object({ tokens: z.array(listedToken) }).parse(j).tokens)
      .catch(() => []),
  ])
  const listed = new Map([...list, ...LOCAL_TOKENS].map((t) => [t.address, t]))

  const live = pairs.filter(
    (p) => Number(p.reserve0) > 0 && Number(p.reserve1) > 0,
  )
  const used = new Set(live.flatMap((p) => [p.token0.id, p.token1.id]))

  const supplies = await loadSupplies(
    tokens
      .filter((t) => used.has(t.id))
      .map((t) => SYSTEM_ADDRESSES[t.id] ?? t.id),
  )

  const tokenMap: Record<string, Token> = {}
  for (const t of tokens) {
    if (!used.has(t.id)) continue
    const l = listed.get(t.id)
    const address = SYSTEM_ADDRESSES[t.id] ?? t.id
    const raw = supplies.get(address)
    const supply = raw === undefined ? null : Number(raw) / 10 ** t.decimals
    const usd = Number(t.priceUSD) || 0
    tokenMap[t.id] = {
      id: t.id,
      symbol: l?.symbol ?? t.symbol,
      name: l?.name ?? t.name,
      address,
      decimals: t.decimals,
      usd,
      supply,
      marketCapUsd: supply !== null && usd > 0 ? supply * usd : null,
      color: special[t.id] ?? colorFor(t.id),
      logo: l?.logoURI ?? null,
      verified: !!l,
      allowance: l?.allowance ?? true,
    }
  }

  // Quote each pool in a verified stablecoin, then KOIN, then VHP.
  const rank = (id: string) => {
    const t = tokenMap[id]
    if (t?.verified && STABLES.has(t.symbol.toUpperCase())) return 3
    return id === 'koin' ? 2 : id === 'vhp' ? 1 : 0
  }

  const pools: Pool[] = live
    .filter((p) => tokenMap[p.token0.id] && tokenMap[p.token1.id])
    .map((p) => {
      const [a, b] = [p.token0.id, p.token1.id]
      const quote = rank(a) > rank(b) ? a : b
      const base = quote === a ? b : a
      const reserve = (id: string) => Number(id === a ? p.reserve0 : p.reserve1)
      const volume = (id: string) =>
        Number(id === a ? p.volumeToken0 : p.volumeToken1) || 0
      // KoinDX only tracks USD volume for its whitelisted pairs and reports 0
      // for the rest, so value the traded quote amount (KOIN or a stable) at
      // its current price, falling back to the base side.
      const estimatedVolume =
        volume(quote) * tokenMap[quote].usd || volume(base) * tokenMap[base].usd
      return {
        id: p.id,
        slug: '',
        base,
        quote,
        token0: a,
        feeBps: FEE_BPS,
        baseReserve: reserve(base),
        quoteReserve: reserve(quote),
        tvlUsd: Number(p.reserveUSD) || 0,
        volumeUsd: Number(p.volumeUSD) || estimatedVolume,
        txCount: p.txCount,
        lpCount: p.liquidityProviderCount,
      }
    })
    .sort((x, y) => y.tvlUsd - x.tvlUsd || y.txCount - x.txCount)

  // Symbols aren't unique on Koinos; the deepest pool keeps the readable URL.
  const taken = new Set<string>()
  for (const p of pools) {
    const slug =
      `${tokenMap[p.base].symbol}-${tokenMap[p.quote].symbol}`.toUpperCase()
    const clean = /^[A-Z0-9_]+-[A-Z0-9_]+$/.test(slug) && !taken.has(slug)
    p.slug = clean ? slug : p.id
    taken.add(slug)
  }

  return {
    tokens: tokenMap,
    pools,
    koinUsd: Number(protocol.koinPriceUSD) || 0,
    tvlUsd: Number(protocol.totalLiquidityUSD) || 0,
    volumeUsd: Number(protocol.totalVolumeUSD) || 0,
    txCount: protocol.txCount,
    updatedAt: Date.now(),
  }
}

// Short-lived per-instance caches for public chain data, so concurrent page
// loads share one upstream request. Nothing user-specific is stored here.
let marketCache: { at: number; data: Promise<Market> } | null = null
const MARKET_TTL = 15_000

function cachedMarket() {
  if (!marketCache || Date.now() - marketCache.at > MARKET_TTL) {
    const data = loadMarket()
    marketCache = { at: Date.now(), data }
    data.catch(() => {
      if (marketCache?.data === data) marketCache = null
    })
  }
  return marketCache.data
}

export const getMarket = createServerFn({ method: 'GET' }).handler(() =>
  cachedMarket(),
)

type PoolHistory = {
  at: number
  entries: Map<string, HistoryEntry>
  times: Map<string, number>
}
const historyCache = new Map<string, Promise<PoolHistory>>()
const HISTORY_TTL = 10_000
const PAGE = 100
const MAX_ENTRIES = 300

async function withTimes(entries: HistoryEntry[], times: Map<string, number>) {
  const missing = entries
    .map((e) => e.trx?.transaction.id)
    .filter((id): id is string => !!id && !times.has(id))
  for (let i = 0; i < missing.length; i += PAGE) {
    const t = await getTxTimes(missing.slice(i, i + PAGE))
    t.forEach((v, k) => times.set(k, v))
  }
}

async function loadHistory(
  poolId: string,
  prev?: PoolHistory,
): Promise<PoolHistory> {
  const entries = new Map(prev?.entries)
  const times = new Map(prev?.times)
  const latest = await getHistory(poolId, prev ? 50 : PAGE)
  const fresh = latest.filter((e) => e.seq_num && !entries.has(e.seq_num))
  // On first load, page back once more so longer timeframes have some history.
  if (!prev && latest.length === PAGE) {
    const last = Number(latest[latest.length - 1].seq_num)
    if (last > 0) fresh.push(...(await getHistory(poolId, PAGE, last - 1)))
  }
  await withTimes(fresh, times)
  for (const e of fresh) if (e.seq_num) entries.set(e.seq_num, e)
  const keep = [...entries.keys()]
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, MAX_ENTRIES)
  return {
    at: Date.now(),
    entries: new Map(keep.map((k) => [k, entries.get(k)!])),
    times,
  }
}

async function cachedHistory(poolId: string) {
  const cached = historyCache.get(poolId)
  if (cached) {
    const h = await cached.catch(() => undefined)
    if (h && Date.now() - h.at < HISTORY_TTL) return h
    const next = loadHistory(poolId, h)
    historyCache.set(poolId, next)
    return next.catch((e) => {
      if (h) return h
      throw e
    })
  }
  const next = loadHistory(poolId)
  historyCache.set(poolId, next)
  next.catch(() => historyCache.delete(poolId))
  return next
}

/** Recent swaps of one pool, decoded from the pair contract's on-chain history. */
export const getPoolTrades = createServerFn({ method: 'GET' })
  .validator(
    z.object({ pool: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{26,40}$/) }),
  )
  .handler(async ({ data }): Promise<Trade[]> => {
    const market = await cachedMarket()
    const pool = findPool(market.pools, data.pool)
    if (!pool) throw new Error('Unknown pool')
    const h = await cachedHistory(pool.id)
    return decodeTrades([...h.entries.values()], pool, market.tokens, h.times)
  })

/**
 * Movers are scanned across the deepest and the most traded pools, to bound
 * chain reads without missing busy small-cap pairs. Dust pools are skipped
 * since a single swap swings their price wildly.
 */
const MOVER_POOLS = 30
const MOVER_MIN_TVL = 1
const MOVER_CONCURRENCY = 12
const MOVERS_TTL = 60_000
let moversCache: { at: number; data: Promise<Mover[]> } | null = null

async function loadMovers(): Promise<Mover[]> {
  const market = await cachedMarket()
  const active = market.pools.filter(
    (p) => p.txCount > 0 && p.tvlUsd >= MOVER_MIN_TVL,
  )
  const busiest = [...active].sort((a, b) => b.txCount - a.txCount)
  const candidates = [
    ...new Set([
      ...active.slice(0, MOVER_POOLS),
      ...busiest.slice(0, MOVER_POOLS),
    ]),
  ]
  const now = Date.now()
  const out: Mover[] = []
  let next = 0
  const worker = async () => {
    while (next < candidates.length) {
      const pool = candidates[next++]
      try {
        const h = await cachedHistory(pool.id)
        const trades = decodeTrades(
          [...h.entries.values()],
          pool,
          market.tokens,
          h.times,
        )
        const day = dayChange(trades, poolPrice(pool), now)
        // Pools without swaps in the window didn't move.
        if (day && day.swaps > 0 && Number.isFinite(day.change))
          out.push({ pool: pool.id, ...day })
      } catch {
        // One unreadable pool shouldn't hide the rest.
      }
    }
  }
  await Promise.all(Array.from({ length: MOVER_CONCURRENCY }, worker))
  return out.sort((a, b) => b.change - a.change)
}

/** 24h price change of the deepest and busiest pools that traded today, best first. */
export const getMovers = createServerFn({ method: 'GET' }).handler(() => {
  if (!moversCache || Date.now() - moversCache.at > MOVERS_TTL) {
    const data = loadMovers()
    moversCache = { at: Date.now(), data }
    data.catch(() => {
      if (moversCache?.data === data) moversCache = null
    })
  }
  return moversCache.data
})
