import { useState } from 'react'

import type { Token } from '@/lib/dex'
import { cn } from '@/lib/utils'

export function TokenIcon({
  token,
  className,
}: {
  token: Token
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const showLogo = token.logo && !broken
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-[10px] font-bold text-black ring-2 ring-background',
        className,
      )}
      style={{ background: showLogo ? 'var(--secondary)' : token.color }}
      aria-hidden
    >
      {showLogo ? (
        <img
          src={token.logo!}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        token.symbol.slice(0, 3)
      )}
    </span>
  )
}

export function PairIcon({
  base,
  quote,
  className,
}: {
  base: Token
  quote: Token
  className?: string
}) {
  return (
    <span className={cn('inline-flex -space-x-2', className)}>
      <TokenIcon token={base} />
      <TokenIcon token={quote} />
    </span>
  )
}
