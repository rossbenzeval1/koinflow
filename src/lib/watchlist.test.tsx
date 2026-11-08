import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WatchlistProvider, useWatchlist } from './watchlist'
import { FavoriteButton } from '@/components/dex/favorite-button'

const mocks = vi.hoisted(() => ({
  wallet: {
    address: 'wallet-a' as string | null,
    fresh: true,
    connect: vi.fn(),
  },
  get: vi.fn(),
  set: vi.fn(),
  sign: vi.fn(),
  error: vi.fn(),
}))
vi.mock('./wallet', () => ({
  useWallet: () => mocks.wallet,
  loadKondor: async () => ({ getSigner: () => ({ signMessage: mocks.sign }) }),
}))
vi.mock('./watchlist.functions', () => ({
  getWatchlist: mocks.get,
  getWatchlistClock: async () => Date.now(),
  setFavorite: mocks.set,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }))

function Controls() {
  const list = useWatchlist()
  return (
    <>
      <button onClick={() => void list.unlock()}>Load</button>
      <output>
        {list.ready ? list.favorites.join(',') || 'empty' : 'locked'}
      </output>
      <p data-testid="sync-status">{list.status}</p>
      <FavoriteButton pool="pair-a" label="KOIN/TEST" />
    </>
  )
}
function App() {
  return (
    <WatchlistProvider>
      <Controls />
    </WatchlistProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mocks.wallet.address = 'wallet-a'
  mocks.wallet.fresh = true
  mocks.get.mockResolvedValue([])
  mocks.set.mockResolvedValue({ saved: true })
  mocks.sign.mockResolvedValue(new Uint8Array(65))
})

it('loads saved pairs, adds and removes favorites only after successful saves', async () => {
  const user = userEvent.setup()
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
  await user.click(
    screen.getByRole('button', { name: 'Add KOIN/TEST to watchlist' }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Remove KOIN/TEST from watchlist' }),
    ).toHaveAttribute('aria-pressed', 'true'),
  )
  mocks.get.mockResolvedValue(['pair-a'])
  mocks.set.mockRejectedValueOnce(new Error('offline'))
  await user.click(
    screen.getByRole('button', { name: 'Remove KOIN/TEST from watchlist' }),
  )
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(screen.getByRole('status')).toHaveTextContent('pair-a')
  await user.click(
    screen.getByRole('button', { name: 'Remove KOIN/TEST from watchlist' }),
  )
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
  expect(mocks.set.mock.lastCall?.[0].data.favorite).toBe(false)
})

it('hides prior favorites immediately on account change and disconnect', async () => {
  const user = userEvent.setup()
  mocks.get.mockResolvedValue(['pair-a'])
  const view = render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('pair-a'),
  )
  mocks.wallet.address = 'wallet-b'
  view.rerender(<App />)
  expect(screen.getByRole('status')).toHaveTextContent('locked')
  mocks.get.mockResolvedValue(['pair-b'])
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('pair-b'),
  )
  expect(mocks.sign).toHaveBeenCalledTimes(2)
  mocks.wallet.address = null
  view.rerender(<App />)
  expect(screen.getByRole('status')).toHaveTextContent('locked')
  await user.click(
    screen.getByRole('button', { name: 'Add KOIN/TEST to watchlist' }),
  )
  expect(mocks.wallet.connect).toHaveBeenCalledOnce()
})

it('keeps a new wallet isolated when an old wallet request finishes late', async () => {
  let resolve!: (pairs: string[]) => void
  mocks.get.mockReturnValue(
    new Promise<string[]>((done) => {
      resolve = done
    }),
  )
  const view = render(<App />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalled())
  mocks.get.mockResolvedValue(['pair-b'])
  mocks.wallet.address = 'wallet-b'
  view.rerender(<App />)
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('pair-b'),
  )
  await act(async () => resolve(['pair-a']))
  expect(screen.getByRole('status')).toHaveTextContent('pair-b')
})

it('starts syncing when a disconnected wallet connects', async () => {
  mocks.wallet.address = null
  const view = render(<App />)
  expect(mocks.sign).not.toHaveBeenCalled()
  mocks.get.mockResolvedValue(['pair-a'])
  mocks.wallet.address = 'wallet-a'
  view.rerender(<App />)
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('pair-a'),
  )
  expect(mocks.sign).toHaveBeenCalledOnce()
})

it('allows retry after automatic verification is declined', async () => {
  mocks.sign.mockRejectedValueOnce(new Error('Declined'))
  render(<App />)
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
  expect(screen.getByRole('status')).toHaveTextContent('locked')
  await userEvent.click(screen.getByRole('button', { name: 'Load' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
})

afterEach(() => vi.useRealTimers())

it('shows approval guidance and recovers after a stalled Kondor request', async () => {
  vi.useFakeTimers()
  mocks.sign.mockReturnValueOnce(new Promise(() => {}))
  render(<App />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByTestId('sync-status')).toHaveTextContent(
    'Approve the watchlist message in Kondor',
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000)
  })
  expect(screen.getByTestId('sync-status')).toHaveTextContent(
    'Kondor approval timed out',
  )
  expect(mocks.get).not.toHaveBeenCalled()
  await act(async () => {
    screen.getByRole('button', { name: 'Load' }).click()
  })
  expect(screen.getByRole('status')).toHaveTextContent('empty')
})

it('retries a failed database read without requesting another wallet approval', async () => {
  mocks.get.mockRejectedValueOnce(new Error('offline'))
  render(<App />)
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
  expect(screen.getByTestId('sync-status')).toHaveTextContent(
    'Could not load your saved watchlist',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Load' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
  expect(mocks.sign).toHaveBeenCalledOnce()
})

const proofFor = (address: string, issuedAt = Date.now()) => ({
  address,
  issuedAt,
  nonce: '6f1c1e53-5f4f-4b4e-9d43-2a4f3d7f8c11',
  signature: Array(65).fill(0),
})

it('does not open Kondor on load for a wallet restored from a previous visit', async () => {
  mocks.wallet.address = '1BkqnYaV5pFSj6zxCxfbkxL8XaBzRKbUTd'
  mocks.wallet.fresh = false
  render(<App />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(mocks.sign).not.toHaveBeenCalled()
  expect(mocks.get).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('locked')
  await userEvent.click(screen.getByRole('button', { name: 'Load' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
  expect(mocks.sign).toHaveBeenCalledOnce()
})

it('reuses a still-valid proof after a reload without another approval', async () => {
  const address = '1BkqnYaV5pFSj6zxCxfbkxL8XaBzRKbUTd'
  sessionStorage.setItem(
    'koinflow:watchlist-proof',
    JSON.stringify(proofFor(address)),
  )
  mocks.wallet.address = address
  mocks.wallet.fresh = false
  mocks.get.mockResolvedValue(['pair-a'])
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('pair-a'),
  )
  expect(mocks.sign).not.toHaveBeenCalled()
})

it('asks for a new signature when the server rejects a stored proof', async () => {
  const address = '1BkqnYaV5pFSj6zxCxfbkxL8XaBzRKbUTd'
  sessionStorage.setItem(
    'koinflow:watchlist-proof',
    JSON.stringify(proofFor(address)),
  )
  mocks.wallet.address = address
  mocks.wallet.fresh = false
  mocks.get.mockRejectedValueOnce(new Error('Wallet signature does not match.'))
  render(<App />)
  await waitFor(() =>
    expect(screen.getByTestId('sync-status')).toHaveTextContent(
      'approve the new message',
    ),
  )
  expect(sessionStorage.getItem('koinflow:watchlist-proof')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Load' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('empty'),
  )
  expect(mocks.sign).toHaveBeenCalledOnce()
})
