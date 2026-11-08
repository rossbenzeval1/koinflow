import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useWallet, loadKondor } from './wallet'
import {
  getWatchlist,
  getWatchlistClock,
  setFavorite,
} from './watchlist.functions'
import {
  PROOF_LIFETIME,
  watchlistMessage,
  watchlistProof,
} from './watchlist-auth'
import type { WatchlistProof } from './watchlist-auth'

/** The signed proof is reused for its lifetime, so reloads don't need another Kondor approval. */
const PROOF_KEY = 'koinflow:watchlist-proof'
/** Errors from `verifyWatchlistProof` that mean the proof has to be signed again. */
const AUTH_ERRORS = [
  'Watchlist verification expired. Verify your wallet again.',
  'Wallet signature does not match.',
]

/** Server time minus device time, learned when a proof is issued. */
let clockOffset = 0

function usable(proof: WatchlistProof | null, address: string) {
  return (
    !!proof &&
    proof.address === address &&
    Date.now() + clockOffset - proof.issuedAt < PROOF_LIFETIME - 30_000
  )
}

function readProof(address: string) {
  try {
    const parsed = watchlistProof.safeParse(
      JSON.parse(sessionStorage.getItem(PROOF_KEY) ?? 'null'),
    )
    return parsed.success && usable(parsed.data, address) ? parsed.data : null
  } catch {
    return null
  }
}

function storeProof(proof: WatchlistProof | null) {
  try {
    if (proof) sessionStorage.setItem(PROOF_KEY, JSON.stringify(proof))
    else sessionStorage.removeItem(PROOF_KEY)
  } catch {
    // Storage can be unavailable (private mode); the proof stays in memory.
  }
}

type WatchlistState = {
  favorites: string[]
  ready: boolean
  busy: boolean
  /** Waiting for the user to sign the watchlist message in Kondor. */
  approving: boolean
  error: boolean
  status: string
  unlock: () => Promise<void>
  toggle: (pool: string) => Promise<void>
}
const Context = createContext<WatchlistState | null>(null)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet()
  return (
    <WalletWatchlist key={address ?? 'disconnected'} address={address}>
      {children}
    </WalletWatchlist>
  )
}

function WalletWatchlist({
  address,
  children,
}: {
  address: string | null
  children: React.ReactNode
}) {
  const { connect, fresh } = useWallet()
  const [snapshot, setSnapshot] = useState<{
    owner: string
    favorites: string[]
  } | null>(null)
  const favorites = snapshot?.owner === address ? snapshot.favorites : []
  const ready = snapshot?.owner === address
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState(false)
  const [status, setStatus] = useState('')
  const proof = useRef<WatchlistProof | null>(null)
  const working = useRef(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const authorize = useCallback(async () => {
    if (!address) return null
    if (!usable(proof.current, address)) {
      const serverNow = await getWatchlistClock({
        signal: AbortSignal.timeout(10_000),
      }).catch(() => Date.now())
      clockOffset = serverNow - Date.now()
      const claim = {
        address,
        issuedAt: serverNow,
        nonce: crypto.randomUUID(),
      }
      setStatus(
        'Approve the watchlist message in Kondor. Unlock the extension if needed.',
      )
      setApproving(true)
      const kondor = await loadKondor()
      let timeout: ReturnType<typeof setTimeout> | undefined
      const signature = await Promise.race([
        kondor.getSigner(address).signMessage(watchlistMessage(claim)),
        new Promise<never>(
          (_, reject) =>
            (timeout = setTimeout(
              () => reject(new Error('WATCHLIST_APPROVAL_TIMEOUT')),
              120_000,
            )),
        ),
      ]).finally(() => {
        clearTimeout(timeout)
        if (active.current) setApproving(false)
      })
      if (!active.current) return null
      proof.current = { ...claim, signature: Array.from(signature) }
      storeProof(proof.current)
    }
    return proof.current
  }, [address])

  const run = useCallback(
    async (pool?: string) => {
      if (!address) {
        await connect()
        return
      }
      if (working.current) return
      working.current = true
      setBusy(true)
      setError(false)
      let stage: 'approval' | 'load' | 'save' = 'approval'
      try {
        const auth = await authorize()
        if (!auth || !active.current) return
        stage = 'load'
        setStatus('Loading your saved watchlist…')
        const current = await getWatchlist({
          data: auth,
          signal: AbortSignal.timeout(20_000),
        })
        if (!active.current) return
        if (pool) {
          const favorite = !current.includes(pool)
          stage = 'save'
          setStatus('Saving your watchlist…')
          await setFavorite({
            data: { proof: auth, pool, favorite },
            signal: AbortSignal.timeout(20_000),
          })
          if (!active.current) return
          setSnapshot({
            owner: address,
            favorites: favorite
              ? [...new Set([...current, pool])]
              : current.filter((id) => id !== pool),
          })
          toast.success(
            favorite
              ? 'Pair added to watchlist'
              : 'Pair removed from watchlist',
          )
        } else setSnapshot({ owner: address, favorites: current })
        setStatus('Watchlist synced with your wallet.')
      } catch (cause) {
        if (!active.current) return
        const reason = cause instanceof Error ? cause.message : ''
        const expired = AUTH_ERRORS.includes(reason)
        if (stage === 'approval' || expired) {
          proof.current = null
          storeProof(null)
        }
        const message = expired
          ? `${reason.replace(/ Verify your wallet again\.$/, '')} Retry watchlist and approve the new message in Kondor.`
          : stage === 'approval'
            ? cause instanceof Error &&
              cause.message === 'WATCHLIST_APPROVAL_TIMEOUT'
              ? 'Kondor approval timed out. Close any old Kondor popup, unlock the extension, then retry watchlist.'
              : 'Kondor did not approve the watchlist message. Unlock the extension, close any old popup, then retry watchlist and approve Sign.'
            : stage === 'save'
              ? 'Could not save your watchlist. Check your connection and retry.'
              : 'Could not load your saved watchlist. Check your connection and retry watchlist.'
        setStatus(message)
        setError(true)
        toast.error('Could not sync watchlist', {
          description: message,
        })
      } finally {
        working.current = false
        if (active.current) setBusy(false)
      }
    },
    [address, authorize, connect],
  )

  useEffect(() => {
    if (!address) return
    // A wallet restored from a previous visit only syncs with a still-valid
    // proof. Opening Kondor unprompted on page load gets the popup dismissed
    // or stuck in front of the next swap, so a new signature waits for the user.
    const saved = readProof(address)
    if (saved) proof.current = saved
    else if (!fresh) return
    // Defer until after mount; cleanup cancels Strict Mode's discarded effect.
    const timer = setTimeout(() => void run(), 0)
    return () => clearTimeout(timer)
  }, [address, fresh, run])

  return (
    <Context.Provider
      value={{
        favorites,
        ready,
        busy,
        approving,
        error,
        status,
        unlock: () => run(),
        toggle: (pool) => run(pool),
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useWatchlist() {
  const context = useContext(Context)
  if (!context) throw new Error('WatchlistProvider is missing')
  return context
}
