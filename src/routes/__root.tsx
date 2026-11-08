import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotFoundPage } from '@/components/error-pages'
import { getMarket } from '@/lib/koindx.functions'
import { WatchlistProvider } from '@/lib/watchlist'
import { WalletProvider } from '@/lib/wallet'

import '../styles.css'

const siteName = 'KoinFlow — Live DEX for the Koinos blockchain'
const siteDescription =
  'Trade every Koinos token and KoinDX liquidity pool with on-chain candlesticks, depth and Kondor wallet swaps.'

export const Route = createRootRoute({
  // Every page reads tokens and pools; child routes share this snapshot.
  loader: () => getMarket(),
  staleTime: 15_000,
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: siteName,
      },
      {
        name: 'description',
        content: siteDescription,
      },
      {
        property: 'og:title',
        content: siteName,
      },
      {
        property: 'og:description',
        content: siteDescription,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <WalletProvider>
          <WatchlistProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </WatchlistProvider>
        </WalletProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
