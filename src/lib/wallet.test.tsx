import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WalletProvider, useWallet } from './wallet'

const { getAccounts } = vi.hoisted(() => ({ getAccounts: vi.fn() }))
vi.mock('kondor-js', () => ({ getAccounts }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function Controls() {
  const wallet = useWallet()
  return (
    <>
      <button onClick={() => void wallet.connect()}>Connect</button>
      <output>{wallet.address ?? 'disconnected'}</output>
    </>
  )
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

it('waits for the account popup to close before exposing a wallet for automatic signing', async () => {
  vi.useFakeTimers()
  getAccounts.mockResolvedValue([{ name: 'Test', address: 'wallet-a' }])
  render(
    <WalletProvider>
      <Controls />
    </WalletProvider>,
  )
  await act(async () => {
    screen.getByRole('button').click()
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(getAccounts).toHaveBeenCalledOnce()
  expect(screen.getByRole('status')).toHaveTextContent('disconnected')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(749)
  })
  expect(screen.getByRole('status')).toHaveTextContent('disconnected')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByRole('status')).toHaveTextContent('wallet-a')
})
