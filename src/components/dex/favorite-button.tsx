import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWatchlist } from '@/lib/watchlist'
import { cn } from '@/lib/utils'

export function FavoriteButton({
  pool,
  label,
}: {
  pool: string
  label: string
}) {
  const { favorites, ready, busy, toggle } = useWatchlist()
  const favorite = favorites.includes(pool)
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label={`${favorite ? 'Remove' : 'Add'} ${label} ${favorite ? 'from' : 'to'} watchlist`}
      aria-pressed={favorite}
      title={
        ready
          ? favorite
            ? 'Remove from watchlist'
            : 'Add to watchlist'
          : 'Verify Kondor to sync favorites'
      }
      onClick={(event) => {
        event.stopPropagation()
        void toggle(pool)
      }}
      className={cn('shrink-0', favorite && 'text-primary')}
    >
      <Star className={cn('size-4', favorite && 'fill-current')} />
    </Button>
  )
}
