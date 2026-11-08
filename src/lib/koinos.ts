import { useEffect, useState } from 'react'

import { rpc } from '@/lib/chain-history'

export { KOINOS_RPC } from '@/lib/chain-history'
export const EXPLORER_URL = 'https://koinosblocks.com'

export type HeadInfo = {
  height: number
  irreversible: number
  time: number
}

export async function getHeadInfo(signal?: AbortSignal): Promise<HeadInfo> {
  const r = await rpc<{
    head_topology: { height: string }
    last_irreversible_block: string
    head_block_time: string
  }>('chain.get_head_info', {}, signal)
  return {
    height: Number(r.head_topology.height),
    irreversible: Number(r.last_irreversible_block),
    time: Number(r.head_block_time),
  }
}

/** Polls the chain head so the UI can show a live block height. */
export function useHeadInfo(intervalMs = 3000) {
  const [head, setHead] = useState<HeadInfo | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ctrl = new AbortController()
    const tick = () => {
      ctrl.abort()
      ctrl = new AbortController()
      getHeadInfo(ctrl.signal)
        .then((h) => {
          setHead(h)
          setError(false)
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') setError(true)
        })
    }
    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      clearInterval(id)
      ctrl.abort()
    }
  }, [intervalMs])

  return { head, error }
}
