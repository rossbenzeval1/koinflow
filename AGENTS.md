# AGENTS.md

This document describes the project for developers and AI agents working on this codebase.

## Project Overview

KoinFlow is a live trading DEX terminal for the Koinos blockchain: markets list, per-pair trade terminal with candlestick charts, and a liquidity pools page. **Continue from the roadmap in `PLAN.md`.** Market data, swap history and Kondor swaps are live; next up is a swap indexer in Netlify Database and multi-hop routing.

### Domain code

- `src/lib/koindx.functions.ts`: server functions `getMarket` (every KoinDX pair with liquidity plus its tokens, paged from the KoinDX API and enriched with the curated token list) and `getPoolTrades` (recent swaps decoded from chain history). Both have short per-instance caches.
- `src/lib/chain-history.ts`: Koinos account-history reads and swap/sync event decoding.
- `src/lib/dex.ts`: shared types (`Token`, `Pool`, `Trade`, `Market`), pool lookup by slug or address, candle building and constant-product quotes.
- `src/lib/use-market.ts`: reads the root loader's market snapshot and refreshes it every 15 s.
- `src/lib/wallet.tsx` / `src/lib/swap.ts`: Kondor connection, balances and Mana, and the approve + `swap_tokens_in` transaction against the KoinDX router.
- `src/lib/koinos.ts`: `chain.get_head_info` against `https://api.koinosblocks.com` plus `useHeadInfo()`.
- `src/lib/trader-tier.ts`: DEX Screener-style wallet sizes (plankton → fish → shrimp → dolphin → whale) from each wallet's total USD swapped in the loaded pool history; `src/components/dex/trader-tier-icon.tsx` draws the icons and the trade tape shows them next to each account.
- `src/lib/format.ts`: price/USD/amount/percent formatting.
- `src/lib/indicators.ts`: pure indicator maths (SMA, EMA, RSI, MACD, VWAP, volume profile) and the `INDICATORS` registry the chart and picker read. Add an indicator by registering it there.
- `src/lib/chart-model.ts`: chart settings schema (compare pairs, mode, indicators), ratio/rebase helpers, and `buildChartModel`, which resolves sources (`primary`, `pool:<id>`, `ratio:<id>`, `ind:<id>`) into series, scales and panes. `src/lib/use-chart-settings.ts` keeps the settings in localStorage.
- `src/components/dex/`: site header/footer (logo, nav, live block status, wallet menu), `candle-chart.tsx` (lightweight-charts v5, dynamically imported on the client; renders a `ChartModel` with comparison lines, indicator panes and a volume-profile overlay), `chart-controls.tsx` (Compare picker, mode switch, Indicators picker), order book, trade tape, swap panel, token icons.
- Routes: `/` (markets), `/trade/$pair` (slugs like `KOIN-VUSDT`, case-insensitive, or a pool address; unknown → 404), `/pools`.

### Conventions & decisions

- Light turquoise theme only (no `.dark` class; variables live in `:root`). Up/down colours are `--up`/`--down` (`text-up`, `bg-down/12`, etc.). Numbers use the `.num` class (JetBrains Mono, tabular).
- The chart is canvas-based, so its colours are hex constants (`candle-chart.tsx` and the series palette in `chart-model.ts`), not CSS variables.
- The KoinDX API caps `pageSize` at 500 and returns `priceUSD: null` for unpriced tokens; keep list reads paged and schemas tolerant.
- Anything time-dependent (trade timestamps) is created in effects so SSR and hydration match.

### Tech Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Framework     | TanStack Start                                      |
| Frontend      | React 19, TanStack Router                           |
| Build         | Vite 8                                              |
| Styling       | Tailwind CSS 4, theme variables in `src/styles.css` |
| UI Components | shadcn/ui (Radix UI + Tailwind)                     |
| Toasts        | sonner                                              |
| Icons         | lucide-react                                        |
| Charts        | lightweight-charts v5 (candlesticks)                |
| Language      | TypeScript 6.0 (strict mode)                        |
| Deployment    | Netlify, via `@netlify/vite-plugin-tanstack-start`  |

## Directory Structure

```
├── public
│   └── favicon.ico
├── src
│   ├── components
│   │   ├── error-pages.tsx # Themed 404 and route error pages with home/retry actions.
│   │   └── ui          # shadcn/ui controls, overlays, feedback, forms, and tables.
│   ├── examples
│   │   └── validated-form.tsx # Unmounted form pattern with validation, pending, error, and success states.
│   ├── lib
│   │   └── utils.ts    # cn() helper for merging Tailwind classes.
│   ├── routes
│   │   ├── __root.tsx  # HTML shell, <head> metadata (siteName, siteDescription), the tooltip provider, and the toast container.
│   │   ├── index.tsx   # Markets landing page (/).
│   │   ├── pools.tsx   # Liquidity pools (/pools).
│   │   └── trade.$pair.tsx # Trade terminal (/trade/$pair).
│   ├── router.tsx      # Creates the router from the generated route tree.
│   └── styles.css      # Tailwind import, light turquoise theme variables, base styles.
├── components.json     # shadcn/ui config, used by `npx shadcn add`.
├── netlify.toml        # Build command, publish directory, dev server ports.
├── package.json
├── tsconfig.json
└── vite.config.ts      # Vite path aliases and Tailwind, Netlify, TanStack Start, React plugins.
```

`src/routeTree.gen.ts` is generated by the router plugin when the dev server or build runs. Don't edit it.

Shared framework skill source lives in `frameworks/tanstack-start-react/.claude/skills` in this repository, separate from the standalone starter. Consult the matching framework/Netlify skills when available in a generated app; don't assume the starter contains a `.claude` directory.

## Key Concepts

### File-Based Routing

Route files in `src/routes/` define pages and endpoints:

- `__root.tsx` wraps every page.
- `index.tsx` is `/`.
- `about.tsx` would be `/about`.
- `api.*.ts` files are server API endpoints. See the `tanstack-start-api-routes` skill.

### Theme Variables

Colors and corner radius are CSS variables in `src/styles.css` (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--radius`, and more). The site uses a single light turquoise palette. Tailwind exposes them as classes such as `bg-primary`, `text-muted-foreground`, and `border-border`.

Set these variables for the product before you build any page. In components, use the variable classes instead of raw colors like `bg-white` or `text-gray-600`, so the whole site changes when a variable changes.

### UI Components

Ready-made components are in `src/components/ui/`. Use them before writing your own, and restyle them through the theme variables or their variants. Add more with `npx shadcn add <name>`. Show a toast by calling `toast()` from `sonner`; the container is already mounted in `__root.tsx`. `TooltipProvider` is mounted there too, so `Tooltip` works anywhere without its own provider.

| Need               | Components                                                         |
| ------------------ | ------------------------------------------------------------------ |
| Actions and status | Button, Badge, Progress, Skeleton, Alert, Sonner                   |
| Forms              | Input, Textarea, Label, Checkbox, RadioGroup, Switch, Select, Form |
| Overlays and menus | Dialog, Sheet, Popover, DropdownMenu, Tooltip                      |
| Content and layout | Card, Tabs, Accordion, Separator, Table                            |

Use `Form` with React Hook Form and the Zod resolver. Start from `src/examples/validated-form.tsx`; it isn't mounted or connected to a backend. Its required `onSubmit` callback must reject on failure. See [the form pattern](docs/forms.md) for HTTP submission and error handling.

Use Sheet for a mobile menu and DropdownMenu for short action lists. Give Dialog and Sheet an accessible title and description. Pair Checkbox, RadioGroup, Switch, and inputs with visible labels. Reserve tables for tabular data and wrap them in their provided scroll container.

### Design Choices

Set the product's palette, heading/body fonts, and layout before building its screens. Use an explicit user design when supplied; otherwise choose defaults that fit the product. Keep Basic's placeholder until you replace it with the requested product.

- Set `--font-body` and `--font-heading` in `src/styles.css`. Use `font-display` for headings when the product needs a separate heading font.
- Use `max-w-content` for a page container and `max-w-reading` for long text. Keep consistent horizontal padding, such as `px-4 sm:px-6`, and a small repeated spacing scale, such as `gap-4`, `gap-6`, and `py-12`.
- Keep one main heading per page and a clear heading order. Use muted text for supporting copy, not essential low-contrast labels.
- Preserve focus rings. Give icon-only buttons an accessible name. Ensure actions work with a keyboard and on narrow screens.
- Use short color/opacity transitions. Add `motion-reduce:transition-none` or `motion-reduce:animate-none` when adding motion; don't make essential content depend on animation.
- Provide loading, empty, error, and success states for each data-driven screen. Skeletons should follow the shape of the content they replace.

### Routing and Server Data

Router types are registered in `src/router.tsx`, so use typed `Link` destinations and route parameters. The root route supplies the themed 404 page; the router's default error component supplies the safe retry/home page, including child-route SSR failures. Use `throw notFound()` for absent records; keep unexpected failures on the error path. See [routing conventions](src/routes/README.md).

Start with route loaders and server functions for server data. Validate server-function input with `.validator(...)`, keep secrets on the server, and handle HTTP failures before returning data. See [the data-fetching pattern](docs/data-fetching.md). Add TanStack Query only when client-side caching, mutations, or background refresh are needed.

### Browser Storage

Pages are rendered on the server first, where `window` and `localStorage` don't exist. Read `localStorage` inside `useEffect`, not during render or in a `useState` initializer, or the first render will differ from the server HTML and React will log a hydration error.

## Configuration Files

| File             | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `vite.config.ts` | Vite path aliases and Tailwind, Netlify, TanStack Start, React plugins                           |
| `tsconfig.json`  | Strict TypeScript, with the `@/*` alias for `src/*`                                              |
| `netlify.toml`   | Builds with `vite build`, publishes `dist/client`, dev server on port 8888 proxying Vite on 3000 |

## Development Commands

Use Node 22.13+ on the Node 22 line, Node 24, or Node 26+. The installed lint and test tools set this minimum alongside the framework.

```bash
npm run dev        # Start the Vite dev server on port 3000
npm run build      # Production build
npm run typecheck  # Type-check with tsc; the build doesn't
npm run lint       # Check TypeScript and React Hooks rules
npm run format:check # Check formatting
npm run format     # Format project files
npm test           # Run local form, control, and error page tests
npm run preview    # Preview the production build
```

## Conventions

- Components: PascalCase. Utilities and hooks: camelCase. Route files: kebab-case.
- Import from `src` with the `@/` alias.
- TypeScript fails on unused locals and parameters, so remove what you don't use.
- Use React hooks for state.
- Run the dev server or build once to generate route types before type-checking a fresh copy.
- Run build, typecheck, lint, format:check, and tests before reporting completion. Verify changed user flows locally; a passing build doesn't prove an interaction works.

## Application Name

Set the product's name and description in `src/routes/__root.tsx`:

- `siteName` is the page title and the title shown when the link is shared.
- `siteDescription` is the meta description and the description shown when the link is shared.

Then replace the placeholder heading and text in `src/routes/index.tsx`.
