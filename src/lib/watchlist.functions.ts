import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { watchlistProof, walletAddress } from './watchlist-auth'

/** Server clock for the proof's `issuedAt`, so a skewed device clock can't make every proof look expired. */
export const getWatchlistClock = createServerFn({ method: 'GET' }).handler(() =>
  Date.now(),
)

export const getWatchlist = createServerFn({ method: 'POST' })
  .validator(watchlistProof)
  .handler(async ({ data }) => {
    const { verifyWatchlistProof } = await import('./watchlist-auth')
    const address = await verifyWatchlistProof(data)
    const { db } = await import('../../db/index')
    const { favorites } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')
    const rows = await db
      .select({ pool: favorites.pool })
      .from(favorites)
      .where(eq(favorites.wallet, address))
    return rows.map((row) => row.pool)
  })

export const setFavorite = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      proof: watchlistProof,
      pool: walletAddress,
      favorite: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { verifyWatchlistProof } = await import('./watchlist-auth')
    const address = await verifyWatchlistProof(data.proof)
    const { db } = await import('../../db/index')
    const { favorites } = await import('../../db/schema')
    const { and, eq } = await import('drizzle-orm')
    if (data.favorite) {
      const { getMarket } = await import('./koindx.functions')
      const market = await getMarket()
      if (!market.pools.some((pool) => pool.id === data.pool))
        throw new Error('Unknown pool')
      await db
        .insert(favorites)
        .values({ wallet: address, pool: data.pool })
        .onConflictDoNothing()
    } else {
      await db
        .delete(favorites)
        .where(
          and(eq(favorites.wallet, address), eq(favorites.pool, data.pool)),
        )
    }
    return { saved: true }
  })
