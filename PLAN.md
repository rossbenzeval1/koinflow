# KoinFlow roadmap

KoinFlow is a live trading DEX terminal for the Koinos blockchain: every token
and liquidity pool on-chain, candlestick charts, depth, a trade tape and swaps
from a Koinos wallet. It ships in small, self-contained milestones.

## 1. Product surface ✅

- Branded Markets landing page with live Koinos block height (read from the koinosblocks.com node), top gainers/losers (24h change of the 30 deepest pools, from decoded swaps, cached 60 s), searchable/sortable markets table.
- Trade terminal per pair: candlestick + volume chart (1m → 1M), AMM depth ladder, streaming trade tape, swap panel with constant-product quotes, price impact and slippage.
- Pools page: TVL/volume/fee KPIs, fee-tier filter, reserves, APR and token directory.
- All market data comes from `src/lib/fixtures.ts` and the preview price feed in `src/lib/use-live-market.ts`.

## 2. On-chain token & pool discovery ✅

- Every KoinDX pair with liquidity and its tokens load from the KoinDX API (paged, 500 rows per page), enriched with names, logos and a "verified" badge from the curated KoinDX token list (`src/lib/koindx.functions.ts`).
- KOIN and VHP use their current mainnet contracts. Pair URLs use `BASE-QUOTE` slugs; when symbols collide, the shallower pool uses its contract address.
- The snapshot is server-rendered by the root loader, cached per instance for 15 s and refreshed in the browser every 15 s (`src/lib/use-market.ts`).

## 3. Swap history & candles (partial)

- ✅ Recent swaps (~200–300 per pool) are read from the pair contract's account history on the Koinos node and decoded from swap/sync events (`src/lib/chain-history.ts`). Candles, 24h stats and the trade tape are built from them.
- ✅ Weekly (Monday UTC) and calendar-month candles aggregate the available swaps; long timeframes disclose incomplete history.
- ⏳ Next: a scheduled Netlify Function that indexes swaps into Netlify Database so longer timeframes have full history.

## 4. Real-time streaming (partial)

- ✅ Short polling: market every 15 s, pool trades every 12 s, block height live.
- ⏳ Price alerts and "new pool" notifications.

## 5. Wallet connection ✅

- Kondor connect/disconnect (remembered between visits), account menu with Mana, token balances in the swap panel. KoinVault is still to do.

## 6. On-chain swaps (partial)

- ✅ Approve + `swap_tokens_in` against the KoinDX router with slippage-protected minimum output, signed in Kondor, tracked until it lands in a block.
- ⏳ Multi-hop routing through KOIN for pairs without a direct pool. Needs a real-wallet test pass.

## 7. Liquidity management

- Currently links out to KoinDX.

- Add/remove liquidity, LP position list with earned fees, impermanent-loss view.

## 8. Polish

- ✅ Favorite trading pairs saved per Kondor wallet in Netlify Database, with message-signature verification, star controls in Markets and the terminal, and a watchlist filter.
- Token pages, chart drawing tools, mobile trade layout.

## 9. Charting workspace (in progress)

Priority order agreed for the next phase of the terminal:

1. ✅ **Multi-series comparison + relative charts.** Compare up to 3 pairs on the trade chart (flip any pair to quote it the other way round). Three modes: _Overlay_ (dual axis: the first comparison on the left axis, more on hidden overlay scales), _% change_ (every series rebased to 0% at the latest common start) and _Ratio_ (this pair ÷ each comparison pair, time-aligned with forward-fill). Settings are remembered in the browser (`src/lib/use-chart-settings.ts`).
2. ✅ **Indicator library with transformations.** SMA, EMA, RSI, MACD, VWAP (daily reset on intraday timeframes) and volume profile, from a registry in `src/lib/indicators.ts`. Any indicator can run on this pair, a comparison pair, a ratio, or an earlier indicator (e.g. RSI of KOIN÷VHP, then an SMA of that RSI). Overlays share the scale of their source; oscillators get their own pane. `src/lib/chart-model.ts` turns settings + candles into a render-ready model.
   - ⏳ Next: Bollinger bands, ATR, OBV; arithmetic transforms (spread, log, z-score) as sources.
3. ⏳ **Chart templates + multi-panel layouts.** Save named layouts (e.g. "KOIN focus", "meme rotation", "liquidity watch") per Kondor wallet in Netlify Database, reusing the signed-message auth from favorites; grid of several chart panels per workspace.
4. ⏳ **Responsiveness pass** (continuous): mobile trade layout, collapsible depth/swap panels, touch-friendly chart controls.
5. ⏳ **Wallet portfolio tracking (Kondor-native).** Balances, LP positions and PnL across pools for the connected wallet, from on-chain history.
6. ⏳ **On-chain metrics dashboard.** Pool creation velocity, unique traders, Mana usage patterns, holder concentration. Depends on the swap indexer (section 3).
7. ⏳ **Cloud alerts.** Price, volume spike, new pool and large-swap alerts evaluated by a scheduled function, delivered to Telegram/Discord/email while the browser is closed.
8. Later: broader exchange syncing beyond KoinDX and sentiment sources.
9. all above complete, we will now monitor the dex for any bugs or issues.
