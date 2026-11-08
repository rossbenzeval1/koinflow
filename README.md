# KoinFlow

A live trading DEX terminal for the [Koinos](https://koinos.io) blockchain. It
shows Koinos tokens and liquidity pools with candlestick charts, AMM depth, a
streaming trade tape and a swap panel. Chain status comes live from the public
node behind [koinosblocks.com](https://koinosblocks.com).

## Screens

- **Markets** (`/`): hero with live block height, top movers, and a searchable, sortable table of all markets
- **Trade** (`/trade/KOIN-USDT`): candlestick + volume chart across six timeframes, depth ladder, trade tape, swap quotes
- **Pools** (`/pools`): TVL/volume/fee KPIs, pool list by fee tier, token directory

Market data (prices, pools, candles, trades) is currently a deterministic
preview feed in `src/lib/fixtures.ts`. Wiring it to on-chain data is the next
milestone. See [PLAN.md](./PLAN.md).

## Tech

TanStack Start (React 19, TanStack Router), Tailwind CSS 4, shadcn/ui,
[lightweight-charts](https://github.com/tradingview/lightweight-charts) for
candlesticks, deployed on Netlify.

## Run locally

```bash
pnpm install
netlify dev    # or: pnpm dev
```

## Roadmap

1. ✅ Product surface: markets, trade terminal, pools
2. On-chain token & pool discovery
3. Swap indexer and candle storage (Netlify Database)
4. Real-time streaming of trades and candles
5. Kondor / KoinVault wallet connection
6. On-chain swaps with routing
7. Liquidity management
8. Polish: token pages, watchlists, indicators

Details in [PLAN.md](./PLAN.md).
