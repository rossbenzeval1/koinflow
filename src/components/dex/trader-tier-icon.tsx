import { Fish, Shrimp } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { TraderTier } from '@/lib/trader-tier'
import { cn } from '@/lib/utils'

type IconProps = Omit<LucideProps, 'ref'>

/** Drawn to match lucide's 24px, 2px-stroke style. */
function Svg({ children, className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

function Plankton(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="9" r="3.5" />
      <circle cx="16.5" cy="8" r="2" />
      <circle cx="14" cy="16" r="3" />
      <circle cx="5.5" cy="17.5" r="1" fill="currentColor" />
      <circle cx="20" cy="14" r=".8" fill="currentColor" />
    </Svg>
  )
}

function Dolphin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 17c1.5-5.5 5.5-9.5 10.5-9.5 3 0 4.8 1.6 5.5 3.5l3 1.2h-3.2c-1.8 1.8-5 2.4-8.3 2-2.4-.3-5 .8-7.5 2.8z" />
      <path d="M11.5 8.3 12.5 4l2.3 3.6" />
      <path d="M4 17 1.5 15.5M4 17l-.5 3" />
      <path d="M11 14.3l-1 2.7" />
      <circle cx="17" cy="10.5" r=".6" fill="currentColor" />
    </Svg>
  )
}

function Whale(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12c0-2.5 2-4 5-4 4.5 0 7.5 2.5 10.5 5.5L19 9l3-1.5-1 3.5 1.5 2.5-3.5-.5c-.5 3-3.5 5-8 5H8c-3.5 0-6-2.5-6-6z" />
      <path d="M2.5 14h7" />
      <circle cx="6" cy="11" r=".6" fill="currentColor" />
      <path d="M6 6V3.5M4 4l2 2 2-2" />
    </Svg>
  )
}

const ICONS = {
  plankton: Plankton,
  fish: Fish,
  shrimp: Shrimp,
  dolphin: Dolphin,
  whale: Whale,
} satisfies Record<TraderTier['id'], unknown>

const TONE: Record<TraderTier['id'], string> = {
  plankton: 'text-muted-foreground/70',
  fish: 'text-muted-foreground',
  shrimp: 'text-foreground/70',
  dolphin: 'text-primary',
  whale: 'text-primary',
}

export function TraderTierIcon({
  tier,
  className,
}: {
  tier: TraderTier['id']
  className?: string
}) {
  const Icon = ICONS[tier]
  return <Icon aria-hidden className={cn('size-3.5', TONE[tier], className)} />
}
