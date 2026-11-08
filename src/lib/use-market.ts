import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { poolPrice } from '@/lib/dex'
import type { Market } from '@/lib/dex'
import { getMarket } from '@/lib/koindx.functions'

const root = getRouteApi('__root__')

/**
 * KoinDX tokens and pools, server-rendered by the root loader and refreshed in
 * the background. `dirs` marks pools whose price moved in the last refresh.
 */
export function useMarket(intervalMs = 15_000) {
  const initial = root.useLoaderData()
  const [market, setMarket] = useState<Market>(initial)
  const [dirs, setDirs] = useState<Record<string, 1 | -1>>({})
  const prev = useRef(market)

  useEffect(() => {
    let alive = true
    const id = setInterval(() => {
      getMarket()
        .then((next) => {
          if (!alive) return
          const before = new Map(
            prev.current.pools.map((p) => [p.id, poolPrice(p)]),
          )
          const moved: Record<string, 1 | -1> = {}
          for (const p of next.pools) {
            const was = before.get(p.id)
            const now = poolPrice(p)
            if (was !== undefined && now !== was)
              moved[p.id] = now > was ? 1 : -1
          }
          prev.current = next
          setDirs(moved)
          setMarket(next)
        })
        .catch(() => {
          // Keep showing the last good snapshot; the next tick retries.
        })
    }, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [intervalMs])

  return { market, dirs }
}
