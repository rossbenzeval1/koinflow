import { Signer } from 'koilib'
import { z } from 'zod'

export const walletAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{25,40}$/)
export const watchlistProof = z.object({
  address: walletAddress,
  issuedAt: z.number().int().nonnegative(),
  nonce: z.string().uuid(),
  signature: z.array(z.number().int().min(0).max(255)).length(65),
})
export type WatchlistProof = z.infer<typeof watchlistProof>
export const PROOF_LIFETIME = 15 * 60_000

export function watchlistMessage(proof: Omit<WatchlistProof, 'signature'>) {
  return `KoinFlow wallet watchlist\nSite: koinflow.netlify.app\nWallet: ${proof.address}\nIssued at: ${proof.issuedAt}\nNonce: ${proof.nonce}\nAllow reading and editing my favorite trading pairs for 15 minutes.\nThis does not authorize any blockchain transaction.`
}

export async function verifyWatchlistProof(
  input: WatchlistProof,
  now = Date.now(),
) {
  const proof = watchlistProof.parse(input)
  if (proof.issuedAt > now + 30_000 || now - proof.issuedAt >= PROOF_LIFETIME) {
    throw new Error('Watchlist verification expired. Verify your wallet again.')
  }
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(watchlistMessage(proof)),
    ),
  )
  if (
    Signer.recoverAddress(hash, new Uint8Array(proof.signature)) !==
    proof.address
  ) {
    throw new Error('Wallet signature does not match.')
  }
  return proof.address
}
