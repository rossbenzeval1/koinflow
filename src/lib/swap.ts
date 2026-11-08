import { Contract, Transaction, utils } from 'koilib'
import type { Abi } from 'koilib'

import { PERIPHERY, amountOut } from '@/lib/dex'
import type { Pool, Token } from '@/lib/dex'
import { getProvider, loadKondor } from '@/lib/wallet'

const KOINDX_API = 'https://api.koindx.com'

/** The part of the KoinDX periphery ABI needed for exact-input swaps. */
const PERIPHERY_ABI: Abi = {
  methods: {
    swap_tokens_in: {
      argument: 'periphery.swap_tokens_in_arguments',
      return: 'periphery.empty_object',
      description: 'Swap tokens with exact input',
      entry_point: 2335548678,
      read_only: false,
    },
  },
  koilib_types: {
    nested: {
      periphery: {
        nested: {
          empty_object: { fields: {} },
          swap_tokens_in_arguments: {
            fields: {
              from: {
                type: 'bytes',
                id: 1,
                options: { '(koinos.btype)': 'ADDRESS' },
              },
              receiver: {
                type: 'bytes',
                id: 2,
                options: { '(koinos.btype)': 'ADDRESS' },
              },
              amountIn: {
                type: 'uint64',
                id: 3,
                options: { jstype: 'JS_STRING' },
              },
              amountOutMin: {
                type: 'uint64',
                id: 4,
                options: { jstype: 'JS_STRING' },
              },
              path: { rule: 'repeated', type: 'string', id: 5 },
            },
          },
        },
      },
    },
  },
}

/** Fixed-point string for `parseUnits`, trimmed to the token's precision. */
function toUnits(amount: string, decimals: number) {
  const [whole, frac = ''] = amount.split('.')
  return BigInt(
    utils.parseUnits(
      `${whole || '0'}.${frac.slice(0, decimals) || '0'}`,
      decimals,
    ),
  )
}

/** Fresh integer reserves `[in, out]` for a swap direction, read from KoinDX. */
async function reservesFor(pool: Pool, tokenIn: Token, tokenOut: Token) {
  const res = await fetch(`${KOINDX_API}/v2/pairs/${pool.id}`)
  if (!res.ok) throw new Error('Could not load the latest pool reserves')
  const { result } = (await res.json()) as {
    result: { token0: { id: string }; reserve0: string; reserve1: string }
  }
  const r0 = result.reserve0
  const r1 = result.reserve1
  const [rIn, rOut] = result.token0.id === tokenIn.id ? [r0, r1] : [r1, r0]
  return [
    toUnits(rIn, tokenIn.decimals),
    toUnits(rOut, tokenOut.decimals),
  ] as const
}

export type SwapResult = { txId: string; minOut: number; blockNumber?: number }

/**
 * Swaps an exact `amount` of `tokenIn` through the pool's KoinDX periphery,
 * signed and broadcast by Kondor. Reverts on-chain if fewer than the
 * slippage-adjusted output would be received.
 */
export async function swapExactIn(opts: {
  account: string
  pool: Pool
  tokenIn: Token
  tokenOut: Token
  amount: string
  slippagePct: number
  onSent?: (txId: string) => void
}): Promise<SwapResult> {
  const { account, pool, tokenIn, tokenOut, amount, slippagePct } = opts
  const amountIn = toUnits(amount, tokenIn.decimals)
  if (amountIn <= 0n) throw new Error('Enter an amount to swap')

  const [rIn, rOut] = await reservesFor(pool, tokenIn, tokenOut)
  const out = amountOut(amountIn, rIn, rOut)
  const minOut = (out * BigInt(Math.round((100 - slippagePct) * 100))) / 10_000n
  if (minOut <= 0n) throw new Error('Amount is too small for this pool')

  const kondor = await loadKondor()
  const provider = getProvider()
  const signer = kondor.getSigner(account, { provider })
  const tx = new Transaction({ signer, provider, options: { payer: account } })

  if (tokenIn.allowance) {
    const token = new Contract({
      id: tokenIn.address,
      abi: utils.tokenAbi,
      provider,
      signer,
    })
    await tx.pushOperation(token.functions.approve, {
      owner: account,
      spender: PERIPHERY,
      value: amountIn.toString(),
    })
  }
  const periphery = new Contract({
    id: PERIPHERY,
    abi: PERIPHERY_ABI,
    provider,
    signer,
  })
  await tx.pushOperation(periphery.functions.swap_tokens_in, {
    from: account,
    receiver: account,
    amountIn: amountIn.toString(),
    amountOutMin: minOut.toString(),
    path: [tokenIn.id, tokenOut.id],
  })

  const receipt = await tx.send()
  const txId = tx.transaction.id!
  if (receipt?.reverted) {
    throw new Error(
      receipt.logs?.join('. ') ||
        'The swap reverted on-chain. The price may have moved; try a higher slippage.',
    )
  }
  opts.onSent?.(txId)
  // Polls the node by transaction id, so a block produced before polling
  // starts isn't missed. A slow node only delays the confirmation.
  const blockNumber = await tx
    .wait('byTransactionId', 90_000)
    .then((r) => r.blockNumber)
    .catch(() => undefined)
  return {
    txId,
    blockNumber,
    minOut: Number(utils.formatUnits(minOut.toString(), tokenOut.decimals)),
  }
}
