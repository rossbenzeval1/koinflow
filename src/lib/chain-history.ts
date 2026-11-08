import { utils } from 'koilib'

import type { Pool, Token, Trade } from './dex'

/** Public Koinos JSON-RPC node used by koinosblocks.com (CORS enabled). */
export const KOINOS_RPC = 'https://api.koinosblocks.com'

export async function rpc<T>(
  method: string,
  params: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(KOINOS_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  })
  if (!res.ok) throw new Error(`Koinos RPC ${method} failed (${res.status})`)
  const json = (await res.json()) as { result?: T; error?: { message: string } }
  if (json.error || !json.result)
    throw new Error(json.error?.message ?? `Koinos RPC ${method} failed`)
  return json.result
}

type Event = { source?: string; name: string; data?: string }
type HistoryEntry = {
  seq_num?: string
  trx?: {
    transaction: { id: string; header?: { payer?: string; payee?: string } }
    receipt: { events?: Event[] }
  }
}

/** Minimal protobuf reader: varint fields as bigint, length-delimited fields as bytes. */
function readFields(bytes: Uint8Array) {
  const fields = new Map<number, bigint | Uint8Array>()
  let i = 0
  const varint = () => {
    let v = 0n
    let shift = 0n
    while (i < bytes.length) {
      const b = bytes[i++]
      v |= BigInt(b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7n
    }
    return v
  }
  while (i < bytes.length) {
    const key = Number(varint())
    const field = key >> 3
    const wire = key & 7
    if (wire === 0) fields.set(field, varint())
    else if (wire === 2) {
      const len = Number(varint())
      fields.set(field, bytes.slice(i, i + len))
      i += len
    } else break
  }
  return fields
}

const num = (v: bigint | Uint8Array | undefined) =>
  typeof v === 'bigint' ? v : 0n
const units = (v: bigint, decimals: number) => Number(v) / 10 ** decimals

/**
 * Turns a pair contract's account history into trades. Each `core.swap_event`
 * is paired with the `core.sync_event` the pair emits just before it, which
 * carries the reserves after the swap (and therefore the new mid price).
 */
export function decodeTrades(
  entries: HistoryEntry[],
  pool: Pool,
  tokens: Record<string, Token>,
  times: Map<string, number>,
): Trade[] {
  const base = tokens[pool.base]
  const quote = tokens[pool.quote]
  const baseIs0 = pool.token0 === pool.base
  const trades: Trade[] = []
  for (const e of entries) {
    const trx = e.trx
    if (!trx) continue
    const txId = trx.transaction.id
    const time = times.get(txId)
    if (!time) continue
    const account =
      trx.transaction.header?.payee || trx.transaction.header?.payer || ''
    let reserves: [bigint, bigint] | null = null
    ;(trx.receipt.events ?? []).forEach((ev, idx) => {
      if (ev.source !== pool.id || !ev.data) return
      const f = readFields(utils.decodeBase64url(ev.data))
      if (ev.name === 'core.sync_event') {
        reserves = [num(f.get(1)), num(f.get(2))]
        return
      }
      if (ev.name !== 'core.swap_event' || !reserves) return
      const [in0, in1, out0, out1] = [3, 4, 5, 6].map((k) => num(f.get(k)))
      const [baseIn, baseOut, quoteIn, quoteOut] = baseIs0
        ? [in0, out0, in1, out1]
        : [in1, out1, in0, out0]
      const side = baseOut > 0n ? 'buy' : 'sell'
      const amount = units(side === 'buy' ? baseOut : baseIn, base.decimals)
      const quoteAmount = units(
        side === 'buy' ? quoteIn : quoteOut,
        quote.decimals,
      )
      const [r0, r1] = reserves
      const [rb, rq] = baseIs0 ? [r0, r1] : [r1, r0]
      if (amount <= 0 || rb === 0n) return
      trades.push({
        id: `${txId}:${idx}`,
        tx: txId,
        time,
        side,
        price: quoteAmount / amount,
        mid: units(rq, quote.decimals) / units(rb, base.decimals),
        amount,
        account,
      })
    })
  }
  return trades.sort((a, b) => b.time - a.time)
}

/** Latest `limit` history entries of an address, newest first, optionally before `seq`. */
export async function getHistory(
  address: string,
  limit: number,
  beforeSeq?: number,
) {
  const params: Record<string, unknown> = {
    address,
    limit,
    ascending: false,
    irreversible: false,
  }
  if (beforeSeq !== undefined) params.seq_num = String(beforeSeq)
  const r = await rpc<{ values?: HistoryEntry[] }>(
    'account_history.get_account_history',
    params,
  )
  return r.values ?? []
}

/** Block timestamps for transactions (ms), via their containing blocks. */
export async function getTxTimes(txIds: string[]) {
  const times = new Map<string, number>()
  if (txIds.length === 0) return times
  const { transactions = [] } = await rpc<{
    transactions?: {
      transaction: { id: string }
      containing_blocks?: string[]
    }[]
  }>('transaction_store.get_transactions_by_id', { transaction_ids: txIds })
  const blockOf = new Map(
    transactions.map((t) => [t.transaction.id, t.containing_blocks?.[0]]),
  )
  const blockIds = [
    ...new Set([...blockOf.values()].filter((b): b is string => !!b)),
  ]
  if (blockIds.length === 0) return times
  const { block_items = [] } = await rpc<{
    block_items?: {
      block_id: string
      block?: { header?: { timestamp?: string } }
    }[]
  }>('block_store.get_blocks_by_id', {
    block_ids: blockIds,
    return_block: true,
    return_receipt: false,
  })
  const blockTime = new Map(
    block_items.map((b) => [
      b.block_id,
      Number(b.block?.header?.timestamp ?? 0),
    ]),
  )
  for (const [tx, block] of blockOf) {
    const t = block && blockTime.get(block)
    if (t) times.set(tx, t)
  }
  return times
}

export type { HistoryEntry }

/** KCS-4 `total_supply` entry point, shared by KOIN, VHP and every token contract. */
const TOTAL_SUPPLY = 0xb0da3934

/** Raw on-chain total supply of a token contract, in base units. Empty supply reads as 0. */
export async function getTotalSupply(contract: string, signal?: AbortSignal) {
  const r = await rpc<{ result?: string }>(
    'chain.read_contract',
    { contract_id: contract, entry_point: TOTAL_SUPPLY, args: '' },
    signal,
  )
  if (!r.result) return 0n
  return num(
    readFields(utils.decodeBase64url(r.result.replace(/=+$/, ''))).get(1),
  )
}
