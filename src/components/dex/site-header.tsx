import { Link } from '@tanstack/react-router'
import { Copy, ExternalLink, LogOut, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DEFAULT_PAIR, shortAddress } from '@/lib/dex'
import { EXPLORER_URL, useHeadInfo } from '@/lib/koinos'
import { cn } from '@/lib/utils'
import { getMana, useWallet } from '@/lib/wallet'
import { formatAmount } from '@/lib/format'
import { useEffect, useState } from 'react'

function NavLinks({ className }: { className: string }) {
  const active = { className: 'text-foreground bg-secondary' }
  return (
    <>
      <Link
        to="/"
        className={className}
        activeProps={active}
        activeOptions={{ exact: true }}
      >
        Markets
      </Link>
      <Link
        to="/trade/$pair"
        params={{ pair: DEFAULT_PAIR }}
        className={className}
        activeProps={active}
      >
        Trade
      </Link>
      <Link to="/pools" className={className} activeProps={active}>
        Pools
      </Link>
    </>
  )
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M9 22V10M9 16l7-6M9 16l7 6"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="19" y="9" width="3" height="10" rx="1" fill="#ffffff" />
        <rect
          x="23.5"
          y="13"
          width="3"
          height="10"
          rx="1"
          fill="#ffffff"
          opacity=".55"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-tight">
          Koin<span className="text-primary">Flow</span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-primary">
          Powered By RL-ENERGY
        </span>
      </span>
    </Link>
  )
}

export function BlockStatus({ className }: { className?: string }) {
  const { head, error } = useHeadInfo()
  return (
    <a
      href={head ? `${EXPLORER_URL}/block/${head.height}` : EXPLORER_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
      title="Latest Koinos mainnet block, via koinosblocks.com"
    >
      <span className="relative flex size-2">
        {!error && head && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
        )}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            error ? 'bg-down' : head ? 'bg-up' : 'bg-muted-foreground',
          )}
        />
      </span>
      {error ? (
        'Node unreachable'
      ) : head ? (
        <span>
          Block{' '}
          <span className="num text-foreground">
            #{head.height.toLocaleString('en-US')}
          </span>
        </span>
      ) : (
        'Connecting…'
      )}
    </a>
  )
}

export function WalletButton() {
  const { address, name, connecting, connect, disconnect } = useWallet()
  // Tagged with its account so a stale value never shows after switching.
  const [manaOf, setManaOf] = useState<{
    address: string
    mana: number
  } | null>(null)
  const mana = manaOf && manaOf.address === address ? manaOf.mana : null

  useEffect(() => {
    if (!address) return
    let alive = true
    getMana(address)
      .then((m) => alive && setManaOf({ address, mana: m }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [address])

  if (!address) {
    return (
      <Button size="sm" onClick={connect} disabled={connecting}>
        <Wallet /> {connecting ? 'Check Kondor…' : 'Connect Kondor'}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="num">
          <span className="size-2 rounded-full bg-up" aria-hidden />
          {shortAddress(address)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{name || 'Kondor account'}</div>
          <div className="num truncate text-xs text-muted-foreground">
            {address}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Mana{' '}
            <span className="num text-foreground">
              {mana === null ? '…' : formatAmount(mana)}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard
              .writeText(address)
              .then(() => toast.success('Address copied'))
          }}
        >
          <Copy /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`${EXPLORER_URL}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> View on koinosblocks
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={disconnect}>
          <LogOut /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-content items-center gap-6 px-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" />
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <BlockStatus className="hidden sm:flex" />
          <WalletButton />
        </div>
      </div>
      <nav className="flex gap-1 border-t px-4 py-1.5 md:hidden">
        <NavLinks className="rounded-md px-3 py-1 text-sm text-muted-foreground" />
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">
            KoinFlow - Powered By RL-ENERGY
          </span>
          <span>A live DEX terminal for the Koinos blockchain</span>
        </span>
        <span>
          Chain data via{' '}
          <a
            href={EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            koinosblocks.com
          </a>{' '}
          · Pools and prices via{' '}
          <a
            href="https://app.koindx.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            KoinDX
          </a>
        </span>
      </div>
    </footer>
  )
}
