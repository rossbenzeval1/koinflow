import { ArrowDownUp, ExternalLink, Info, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { TokenIcon } from '@/components/dex/token-icon'
import { Button } from '@/components/ui/button'
import { quoteSwap } from '@/lib/dex'
import type { Pool, Token } from '@/lib/dex'
import { formatAmount, formatPrice } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/koinos'
import { swapExactIn } from '@/lib/swap'
import { cn } from '@/lib/utils'
import { useBalances, useWallet } from '@/lib/wallet'
import { useWatchlist } from '@/lib/watchlist'

const SLIPPAGE = [0.1, 0.5, 1] as const

type Stage = 'idle' | 'signing' | 'confirming'

export function SwapPanel({
  pool,
  base,
  quote,
  price,
  onSwapped,
}: {
  pool: Pool
  base: Token
  quote: Token
  price: number
  onSwapped?: () => void
}) {
  const wallet = useWallet()
  // Kondor shows one request at a time; a swap sent while the watchlist
  // message is open gets stuck behind it.
  const { approving } = useWatchlist()
  const { balances, exact, refresh } = useBalances([base, quote])
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(0.5)
  const [stage, setStage] = useState<Stage>('idle')

  const pay = side === 'buy' ? quote : base
  const get = side === 'buy' ? base : quote
  const payToken = pay.symbol
  const getToken = get.symbol
  const value = Number(amount) || 0
  const q = quoteSwap(pool, side, value)
  const minOut = q.out * (1 - slippage / 100)
  const balance = balances[pay.id]
  const short = wallet.address && Number.isFinite(balance) && value > balance

  async function submit() {
    if (!wallet.address) return wallet.connect()
    if (approving) return
    setStage('signing')
    const id = toast.loading('Confirm the swap in Kondor…')
    try {
      const r = await swapExactIn({
        account: wallet.address,
        pool,
        tokenIn: pay,
        tokenOut: get,
        amount,
        slippagePct: slippage,
        onSent: () => {
          setStage('confirming')
          toast.loading('Swap sent, waiting for the next block…', { id })
        },
      })
      const action = {
        label: 'View tx',
        onClick: () => window.open(`${EXPLORER_URL}/tx/${r.txId}`, '_blank'),
      }
      if (r.blockNumber) {
        toast.success(
          `Swapped ${formatAmount(value)} ${payToken} for ${getToken}`,
          {
            id,
            description: `Included in block #${r.blockNumber.toLocaleString('en-US')}`,
            action,
          },
        )
      } else {
        toast.info('Swap sent', {
          id,
          description:
            'The node has not confirmed it yet. Check the explorer; balances refresh shortly.',
          action,
        })
      }
      setAmount('')
      refresh()
      onSwapped?.()
    } catch (e) {
      toast.error('Swap failed', {
        id,
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setStage('idle')
    }
  }

  const label = !wallet.address
    ? `Connect Kondor to ${side}`
    : stage === 'signing'
      ? 'Confirm in Kondor…'
      : stage === 'confirming'
        ? 'Waiting for block…'
        : approving
          ? 'Finish the watchlist approval in Kondor'
          : !value
            ? 'Enter an amount'
            : short
              ? `Insufficient ${payToken}`
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${base.symbol}`

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid grid-cols-2 rounded-lg bg-secondary p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              'rounded-md py-1.5 text-sm font-semibold capitalize text-muted-foreground transition-colors',
              side === s &&
                (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white'),
            )}
          >
            {s} {base.symbol}
          </button>
        ))}
      </div>

      <div className="relative grid gap-1.5">
        <TokenField
          label="You pay"
          token={pay}
          extra={
            wallet.address && (
              <button
                type="button"
                className="num hover:text-foreground"
                onClick={() => exact[pay.id] && setAmount(exact[pay.id])}
                title="Use full balance"
              >
                Balance{' '}
                {balance === undefined
                  ? '…'
                  : Number.isFinite(balance)
                    ? formatAmount(balance)
                    : '—'}
              </button>
            )
          }
        >
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) =>
              setAmount(
                e.target.value
                  .replace(/[^0-9.]/g, '')
                  .replace(/(\..*)\./g, '$1'),
              )
            }
            className="num w-full bg-transparent text-2xl outline-none placeholder:text-muted-foreground/50"
            aria-label={`Amount of ${payToken} to pay`}
          />
        </TokenField>
        <button
          onClick={() => setSide(side === 'buy' ? 'sell' : 'buy')}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Flip direction"
        >
          <ArrowDownUp className="size-4" />
        </button>
        <TokenField
          label="You receive"
          token={get}
          extra={
            wallet.address &&
            Number.isFinite(balances[get.id]) && (
              <span className="num">
                Balance {formatAmount(balances[get.id])}
              </span>
            )
          }
        >
          <span
            className={cn(
              'num block text-2xl',
              !value && 'text-muted-foreground/50',
            )}
          >
            {value ? formatAmount(q.out) : '0.00'}
          </span>
        </TokenField>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Max slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={cn(
                'num rounded px-2 py-0.5 text-muted-foreground',
                slippage === s
                  ? 'bg-secondary text-foreground'
                  : 'hover:text-foreground',
              )}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      <dl className="grid gap-1.5 rounded-lg border p-3 text-xs">
        <Line
          label="Rate"
          value={`1 ${base.symbol} = ${formatPrice(price)} ${quote.symbol}`}
        />
        <Line
          label="Price impact"
          value={`${q.impact.toFixed(2)}%`}
          tone={q.impact > 3 ? 'down' : q.impact > 1 ? 'warn' : undefined}
        />
        <Line
          label="Pool fee"
          value={
            value
              ? `${formatAmount(q.feeAmount)} ${payToken}`
              : `${pool.feeBps / 100}%`
          }
        />
        <Line
          label="Minimum received"
          value={value ? `${formatAmount(minOut)} ${getToken}` : '—'}
        />
        <Line label="Network fee" value="0 · paid in Mana" />
      </dl>

      <Button
        size="lg"
        className={cn(
          'mt-auto w-full font-semibold',
          side === 'sell' && 'bg-down text-white hover:bg-down/90',
        )}
        onClick={submit}
        disabled={
          wallet.connecting ||
          stage !== 'idle' ||
          (!!wallet.address && approving) ||
          (!!wallet.address && (!value || !!short || q.out <= 0))
        }
      >
        {stage !== 'idle' && (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        )}
        {label}
      </Button>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-px size-3 shrink-0" />
        <span>
          Swaps go through the KoinDX router into the{' '}
          <a
            href={`${EXPLORER_URL}/address/${pool.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline hover:text-foreground"
          >
            {base.symbol}/{quote.symbol} pool{' '}
            <ExternalLink className="size-2.5" />
          </a>
          , signed in Kondor, and revert if you'd receive less than the minimum.
        </span>
      </p>
    </div>
  )
}

function TokenField({
  label,
  token,
  extra,
  children,
}: {
  label: string
  token: Token
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {extra}
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-1 pr-3 text-sm font-semibold">
          <TokenIcon token={token} className="size-5 text-[7px] ring-0" />
          {token.symbol}
        </span>
      </div>
    </div>
  )
}

function Line({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'down' | 'warn'
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'num text-right',
          tone === 'down' && 'text-down',
          tone === 'warn' && 'text-chart-3',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
