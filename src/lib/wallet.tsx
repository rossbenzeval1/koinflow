import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Contract, Provider, utils } from 'koilib'
import { toast } from 'sonner'

import { KOINOS_RPC } from '@/lib/chain-history'
import type { Token } from '@/lib/dex'

export const KONDOR_URL =
  'https://chrome.google.com/webstore/detail/kondor/ghipkefkpgkladckmlmdnadmcchefhjl'
const STORAGE_KEY = 'koinflow:kondor-address'
/** Kondor waits for the user in its popup and never rejects if the extension is missing. */
const CONNECT_TIMEOUT = 60_000

export type WalletAccount = { name: string; address: string }

type WalletState = {
  address: string | null
  name: string | null
  /** Connected by the user in this page view, not restored from a previous visit. */
  fresh: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletState | null>(null)

let provider: Provider | null = null
export function getProvider() {
  provider ??= new Provider([KOINOS_RPC])
  return provider
}

/** kondor-js touches `window` when it loads, so it's only imported in the browser. */
export function loadKondor() {
  return import('kondor-js')
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<never>(
      (_, reject) =>
        (timeout = setTimeout(() => reject(new Error(message)), ms)),
    ),
  ]).finally(() => clearTimeout(timeout))
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [fresh, setFresh] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Restore the last connected account after hydration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // localStorage only exists after hydration, so this has to run in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setAccount(JSON.parse(saved) as WalletAccount)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const kondor = await loadKondor()
      const accounts = await withTimeout(
        kondor.getAccounts(),
        CONNECT_TIMEOUT,
        'Kondor did not respond. Install or unlock the Kondor extension and try again.',
      )
      const first = accounts[0]
      if (!first) throw new Error('No accounts were shared from Kondor.')
      const next = { name: first.name, address: first.address }
      // Kondor responds before closing its account-selection popup. Allow it
      // to close before consumers request another popup for message signing.
      await new Promise((resolve) => setTimeout(resolve, 750))
      setAccount(next)
      setFresh(true)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      toast.success('Kondor connected', {
        description: first.name || first.address,
      })
    } catch (e) {
      toast.error('Could not connect Kondor', {
        description: e instanceof Error ? e.message : String(e),
        action: {
          label: 'Get Kondor',
          onClick: () => window.open(KONDOR_URL, '_blank'),
        },
      })
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAccount(null)
    setFresh(false)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const value = useMemo(
    () => ({
      address: account?.address ?? null,
      name: account?.name ?? null,
      fresh,
      connecting,
      connect,
      disconnect,
    }),
    [account, fresh, connecting, connect, disconnect],
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}

/** Exact balance as a decimal string in token units. */
export async function getTokenBalance(token: Token, owner: string) {
  const c = new Contract({
    id: token.address,
    abi: utils.tokenAbi,
    provider: getProvider(),
  })
  const { result } = await c.functions.balanceOf<{ value?: string }>({ owner })
  return utils.formatUnits(result?.value ?? '0', token.decimals)
}

/** Mana available to the account, in KOIN units. */
export async function getMana(owner: string) {
  return Number(utils.formatUnits(await getProvider().getAccountRc(owner), 8))
}

/**
 * Balances of the given tokens (plus Mana) for the connected account. Refreshes
 * on an interval and whenever `refresh()` is called, e.g. after a swap.
 */
export function useBalances(tokens: Token[], intervalMs = 20_000) {
  const { address } = useWallet()
  const key = tokens.map((t) => t.id).join(',')
  const owner = address ? `${address}|${key}` : null
  // Tagged with the account and token list they were read for, so values from
  // a previous account or pair are never shown.
  const [state, setState] = useState<{
    owner: string
    balances: Record<string, number>
    /** Exact decimal strings, for spending the full balance without rounding up. */
    exact: Record<string, string>
    mana: number | null
  } | null>(null)
  const [tick, setTick] = useState(0)
  const current = state && state.owner === owner ? state : null
  const balances = current?.balances ?? {}
  const exact = current?.exact ?? {}
  const mana = current?.mana ?? null

  useEffect(() => {
    if (!address || !owner) return
    const update = (
      patch: Partial<{
        balances: Record<string, number>
        exact: Record<string, string>
        mana: number | null
      }>,
    ) =>
      setState((s) => ({
        owner,
        balances: s?.owner === owner ? s.balances : {},
        exact: s?.owner === owner ? s.exact : {},
        mana: s?.owner === owner ? s.mana : null,
        ...patch,
      }))
    let alive = true
    const load = () => {
      Promise.all(
        tokens.map((t) =>
          getTokenBalance(t, address)
            .then((b) => [t.id, b] as const)
            .catch(() => [t.id, null] as const),
        ),
      ).then(
        (rows) =>
          alive &&
          update({
            balances: Object.fromEntries(
              rows.map(([id, b]) => [id, b === null ? NaN : Number(b)]),
            ),
            exact: Object.fromEntries(
              rows.flatMap(([id, b]) => (b === null ? [] : [[id, b]])),
            ),
          }),
      )
      getMana(address)
        .then((m) => alive && update({ mana: m }))
        .catch(() => alive && update({ mana: null }))
    }
    load()
    const id = setInterval(load, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
    // `key` stands in for the token list's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, owner, key, intervalMs, tick])

  return { balances, exact, mana, refresh: () => setTick((t) => t + 1) }
}
