import { getDepth } from '@/lib/dex'
import type { Pool, Token } from '@/lib/dex'
import { formatAmount, formatPrice } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Depth ladder implied by the pool's constant-product curve around the live price. */
export function OrderBook({
  pool,
  base,
  quote,
  price,
  dir,
}: {
  pool: Pool
  base: Token
  quote: Token
  price: number
  dir: number
}) {
  const { asks, bids } = getDepth(pool, price, 10)
  const max = Math.max(asks[asks.length - 1].total, bids[bids.length - 1].total)

  const Row = ({
    r,
    side,
  }: {
    r: (typeof asks)[number]
    side: 'ask' | 'bid'
  }) => (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-[12px]">
      <div
        className={cn(
          'absolute inset-y-0 right-0',
          side === 'ask' ? 'bg-down/12' : 'bg-up/12',
        )}
        style={{ width: `${(r.total / max) * 100}%` }}
      />
      <span
        className={cn('num relative', side === 'ask' ? 'text-down' : 'text-up')}
      >
        {formatPrice(r.price)}
      </span>
      <span className="num relative text-right">{formatAmount(r.size)}</span>
      <span className="num relative text-right text-muted-foreground">
        {formatAmount(r.total)}
      </span>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-3 py-2 text-[11px] text-muted-foreground">
        <span>Price ({quote.symbol})</span>
        <span className="text-right">Size ({base.symbol})</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex flex-1 flex-col justify-end">
        {[...asks].reverse().map((r) => (
          <Row key={r.price} r={r} side="ask" />
        ))}
      </div>
      <div className="flex items-center justify-between border-y px-3 py-2">
        <span
          className={cn(
            'num text-base font-semibold',
            dir >= 0 ? 'text-up' : 'text-down',
          )}
        >
          {formatPrice(price)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          AMM mid · {pool.feeBps / 100}% fee
        </span>
      </div>
      <div className="flex-1">
        {bids.map((r) => (
          <Row key={r.price} r={r} side="bid" />
        ))}
      </div>
    </div>
  )
}
