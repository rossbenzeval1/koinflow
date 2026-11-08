import { shortAddress } from '@/lib/dex'
import type { Token, Trade } from '@/lib/dex'
import { useMemo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatAmount, formatPrice, formatUsd } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/koinos'
import { TraderTierIcon } from '@/components/dex/trader-tier-icon'
import { TRADER_TIERS, traderStats } from '@/lib/trader-tier'
import type { TraderStats } from '@/lib/trader-tier'
import { cn } from '@/lib/utils'

function timeOf(ms: number) {
  const d = new Date(ms)
  const sameDay = new Date().toDateString() === d.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour12: false })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        })
}

function TierBadge({ stats }: { stats: TraderStats | undefined }) {
  if (!stats) return <span className="inline-block w-4" aria-hidden />
  const { tier, volumeUsd, swaps } = stats
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tier.label}
          tabIndex={0}
          className="inline-flex w-4 cursor-default justify-center rounded-sm"
        >
          <TraderTierIcon tier={tier.id} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">
        <div className="font-semibold">{tier.label}</div>
        <div className="num">
          {formatUsd(volumeUsd, volumeUsd >= 10_000)} over {swaps} swap
          {swaps === 1 ? '' : 's'} in this pool
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

const usd0 = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

function TierLegend() {
  return (
    <div className="space-y-1">
      <div className="font-semibold">Wallet size (USD swapped here)</div>
      {TRADER_TIERS.map((t, i) => {
        const next = TRADER_TIERS[i + 1]
        return (
          <div key={t.id} className="flex items-center gap-2">
            <TraderTierIcon tier={t.id} className="text-current" />
            <span className="w-14">{t.label}</span>
            <span className="num">
              {next ? `${usd0(t.min)}–${usd0(next.min)}` : `${usd0(t.min)}+`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function TradeTape({
  base,
  quote,
  trades,
  sizeTrades,
  freshId,
}: {
  base: Token
  quote: Token
  trades: Trade[]
  /** Swaps used to size wallets; defaults to `trades`. */
  sizeTrades?: Trade[]
  /** Id of the newest swap seen since the page opened; it flashes once. */
  freshId?: string
}) {
  const stats = useMemo(
    () => traderStats(sizeTrades ?? trades, base, quote),
    [sizeTrades, trades, base, quote],
  )
  const sized = stats.size > 0
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 text-[11px] text-muted-foreground">
        <span>Price ({quote.symbol})</span>
        <span className="text-right">Amount ({base.symbol})</span>
        <span className="text-right">Time</span>
        {sized ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="w-[6.25rem] cursor-help text-right underline decoration-dotted underline-offset-2"
              >
                Account
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <TierLegend />
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="w-20 text-right">Account</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map((t) => (
          <div
            key={t.id}
            className={cn(
              'grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-[3px] text-[12px]',
              t.id === freshId &&
                (t.side === 'buy' ? 'flash-up' : 'flash-down'),
            )}
          >
            <span
              className={cn('num', t.side === 'buy' ? 'text-up' : 'text-down')}
            >
              {formatPrice(t.price)}
            </span>
            <span className="num text-right">{formatAmount(t.amount)}</span>
            <a
              href={`${EXPLORER_URL}/tx/${t.tx}`}
              target="_blank"
              rel="noreferrer"
              className="num text-right text-muted-foreground hover:text-foreground"
              title="View transaction"
            >
              {timeOf(t.time)}
            </a>
            <span
              className={cn(
                'flex items-center justify-end gap-1',
                sized ? 'w-[6.25rem]' : 'w-20',
              )}
            >
              {sized && <TierBadge stats={stats.get(t.account)} />}
              <a
                href={`${EXPLORER_URL}/address/${t.account}`}
                target="_blank"
                rel="noreferrer"
                className="num text-right text-muted-foreground hover:text-foreground"
              >
                {shortAddress(t.account)}
              </a>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
