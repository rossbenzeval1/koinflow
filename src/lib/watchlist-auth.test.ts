// @vitest-environment node
import { expect, it } from 'vitest'
import { Signer } from 'koilib'
import {
  verifyWatchlistProof,
  watchlistMessage,
  PROOF_LIFETIME,
} from './watchlist-auth'

it('verifies a Kondor-compatible signed message and rejects expired, tampered and foreign-wallet proofs', async () => {
  const signer = Signer.fromSeed('watchlist-test-wallet')
  const now = Date.now()
  const claim = {
    address: signer.getAddress(),
    issuedAt: now,
    nonce: crypto.randomUUID(),
  }
  const proof = {
    ...claim,
    signature: Array.from(await signer.signMessage(watchlistMessage(claim))),
  }
  await expect(verifyWatchlistProof(proof, now)).resolves.toBe(claim.address)
  await expect(
    verifyWatchlistProof(proof, now + PROOF_LIFETIME),
  ).rejects.toThrow('expired')
  await expect(verifyWatchlistProof(proof, now - 60_000)).rejects.toThrow(
    'expired',
  )
  await expect(
    verifyWatchlistProof(
      { ...proof, address: Signer.fromSeed('other-test-wallet').getAddress() },
      now,
    ),
  ).rejects.toThrow()
  await expect(
    verifyWatchlistProof({ ...proof, issuedAt: now - 1 }, now),
  ).rejects.toThrow()
  await expect(
    verifyWatchlistProof({ ...proof, signature: [1, 2] }, now),
  ).rejects.toThrow()
})
