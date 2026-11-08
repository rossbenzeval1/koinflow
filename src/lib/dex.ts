/**
 * Market types and AMM math for KoinFlow.
 *
 * Tokens and pools come from KoinDX (the Koinos AMM) via `koindx.functions.ts`;
 * swaps and candles are decoded from each pool's on-chain history. Everything
 * here is pure so it runs on the server and in the browser.
 */

export type Token = {
  /** KoinDX token id: `koin`, `vhp` or the token contract address. Also the swap path entry. */
  id: string
  symbol: string
  name: string
  /** Contract address on Koinos mainnet. */
  address: string
  decimals: number
  usd: number
  /** On-chain total supply in token units, or null when it couldn't be read. */
  supply: number | null
  /** Total supply × USD price, or null without a supply or a USD price. */
  marketCapUsd: number | null
  color: string
  logo: string | null
  /** Listed in the curated KoinDX token list. */
  verified: boolean
  /** Whether the periphery needs an `approve` before spending this token. */
  allowance: boolean
}

export type Pool = {
  /** Pair contract address. */
  id: string
  /** URL id, e.g. `KOIN-VUSDT`. Falls back to the address when two pools share symbols. */
  slug: string
  base: string
  quote: string
  /** Token id stored as `reserve0` in the pair contract. */
  token0: string
  /** Swap fee in basis points. */
  feeBps: number
  /** Reserves in token units. */
  baseReserve: number
  quoteReserve: number
  tvlUsd: number
  /** Cumulative volume since the pool was created. */
  volumeUsd: number
  txCount: number
  lpCount: number
}

export type Market = {
  tokens: Record<string, Token>
  pools: Pool[]
  koinUsd: number
  tvlUsd: number
  volumeUsd: number
  txCount: number
  updatedAt: number
}

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Trade = {
  /** `txId:index`, stable across refreshes. */
  id: string
  tx: string
  time: number
  side: 'buy' | 'sell'
  /** Execution price, in quote per base. */
  price: number
  /** Pool mid price after the swap. */
  mid: number
  /** Base token amount. */
  amount: number
  account: string
}

/** KoinDX periphery (router) contract on mainnet. */
export const PERIPHERY = '17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s'
/** KoinDX pairs charge 0.25% (9975/10000). */
export const FEE_BPS = 25
export const DEFAULT_PAIR = 'KOIN-VUSDT'

export function findPool(pools: Pool[], slug: string) {
  const s = slug.toLowerCase()
  return pools.find(
    (p) => p.slug.toLowerCase() === s || p.id.toLowerCase() === s,
  )
}

/** Mid price of a pool, quoted in the quote token. */
export function poolPrice(p: Pool) {
  return p.quoteReserve / p.baseReserve
}

/** Constant-product (x·y=k) quote for swapping `amountIn` of one side. */
export function quoteSwap(p: Pool, side: 'buy' | 'sell', amountIn: number) {
  const fee = 1 - p.feeBps / 10_000
  const [rIn, rOut] =
    side === 'buy'
      ? [p.quoteReserve, p.baseReserve]
      : [p.baseReserve, p.quoteReserve]
  const inAfterFee = amountIn * fee
  const out = (inAfterFee * rOut) / (rIn + inAfterFee)
  const spot = rOut / rIn
  const exec = amountIn > 0 ? out / amountIn : spot
  const impact = amountIn > 0 ? Math.max(0, (1 - exec / (spot * fee)) * 100) : 0
  return { out, impact, feeAmount: amountIn - inAfterFee }
}

/** Exact integer output the pair contract pays, matching KoinDX's `get_amount_out`. */
export function amountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n
  const inWithFee = amountIn * 9975n
  return (inWithFee * reserveOut) / (reserveIn * 10_000n + inWithFee)
}

export const TIMEFRAMES = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '1h', label: '1H', seconds: 3600 },
  { id: '4h', label: '4H', seconds: 14_400 },
  { id: '1d', label: '1D', seconds: 86_400 },
  { id: '1w', label: '1W', seconds: 604_800 },
  { id: '1M', label: '1M', seconds: null },
] as const

export type TimeframeId = (typeof TIMEFRAMES)[number]['id']

/** UTC calendar boundaries: Monday weeks and actual calendar months. */
export function candleStart(timestamp: number, timeframe: TimeframeId) {
  const date = new Date(timestamp)
  if (timeframe === '1M') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
  }
  if (timeframe === '1w') {
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    return date.getTime() / 1000
  }
  const step = TIMEFRAMES.find((t) => t.id === timeframe)!.seconds!
  return Math.floor(timestamp / 1000 / step) * step
}

/**
 * OHLCV candles from swaps (newest first or any order). Each candle opens at the
 * previous close so the series is continuous; periods without swaps are skipped.
 */
export function buildCandles(
  trades: Trade[],
  timeframe: TimeframeId,
): Candle[] {
  const sorted = [...trades].sort((a, b) => a.time - b.time)
  const out: Candle[] = []
  for (const t of sorted) {
    const time = candleStart(t.time, timeframe)
    const last = out[out.length - 1]
    if (last && last.time === time) {
      last.high = Math.max(last.high, t.mid)
      last.low = Math.min(last.low, t.mid)
      last.close = t.mid
      last.volume += t.amount
    } else {
      const open = last ? last.close : t.price
      out.push({
        time,
        open,
        high: Math.max(open, t.mid),
        low: Math.min(open, t.mid),
        close: t.mid,
        volume: t.amount,
      })
    }
  }
  return out
}

export function shortAddress(a: string) {
  return `${a.slice(0, 5)}…${a.slice(-4)}`
}

/** AMM-implied depth: cumulative size available at each price level. */
export function getDepth(p: Pool, mid: number, levels = 12) {
  const k = p.baseReserve * p.quoteReserve
  const step = 0.0025
  const asks = []
  const bids = []
  for (let i = 1; i <= levels; i++) {
    const askPrice = mid * (1 + step * i)
    const bidPrice = mid * (1 - step * i)
    const askBase = p.baseReserve - Math.sqrt(k / askPrice)
    const bidBase = Math.sqrt(k / bidPrice) - p.baseReserve
    asks.push({ price: askPrice, total: askBase })
    bids.push({ price: bidPrice, total: bidBase })
  }
  const withSize = (rows: { price: number; total: number }[]) =>
    rows.map((r, i) => ({ ...r, size: r.total - (rows[i - 1]?.total ?? 0) }))
  return { asks: withSize(asks), bids: withSize(bids) }
}

export const DAY_MS = 86_400_000

/**
 * Price change (%) over the last 24h, measured from the mid after the last swap
 * before the window. Null when the history doesn't reach back that far.
 */
export function dayChange(trades: Trade[], price: number, now: number) {
  const since = now - DAY_MS
  const open = trades.find((t) => t.time < since)?.mid
  if (!open) return null
  return {
    change: ((price - open) / open) * 100,
    swaps: trades.filter((t) => t.time >= since).length,
  }
}

export type Mover = {
  pool: string
  change: number
  swaps: number
}
