export function formatPrice(n: number) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 7
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  })
}

export function formatUsd(n: number, compact = true) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 2 : n < 1 ? 5 : 2,
  })
}

export function formatAmount(n: number) {
  return n.toLocaleString('en-US', {
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6,
  })
}

export function formatPct(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

/** Decimal places the chart's price scale should show for a given price. */
export function pricePrecision(n: number) {
  if (n >= 1000) return 2
  if (n >= 1) return 4
  if (n >= 0.01) return 5
  return 7
}
