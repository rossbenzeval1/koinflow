import { formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Change({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return (
    <span
      className={cn('num', value >= 0 ? 'text-up' : 'text-down', className)}
    >
      {formatPct(value)}
    </span>
  )
}
