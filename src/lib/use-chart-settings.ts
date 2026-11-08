import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_SETTINGS, parseSettings } from '@/lib/chart-model'
import type { ChartSettings } from '@/lib/chart-model'

const STORAGE_KEY = 'koinflow.chart.v1'

/**
 * Comparison pairs, compare mode and indicators, remembered in this browser.
 * Starts from defaults so SSR and hydration match, then restores in an effect.
 */
export function useChartSettings() {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // localStorage only exists after hydration, so this has to run in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSettings(parseSettings(JSON.parse(saved)))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const update = useCallback(
    (fn: (s: ChartSettings) => ChartSettings) =>
      setSettings((prev) => {
        const next = fn(prev)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Storage full or disabled: keep the settings for this visit only.
        }
        return next
      }),
    [],
  )

  return [settings, update] as const
}
