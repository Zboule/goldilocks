import { useEffect } from "react";
import type { Manifest, Filter } from "../types";
import { fetchTile } from "../lib/tileCache";

export function usePreloadPeriod(
  period: number,
  manifest: Manifest | null,
  displayVariable: string,
  filters: Filter[],
) {
  useEffect(() => {
    if (!manifest) return;

    const periods = manifest.periods;
    const idx = periods.indexOf(period);
    const adjacent = [
      idx > 0 ? periods[idx - 1] : null,
      idx < periods.length - 1 ? periods[idx + 1] : null,
    ].filter((p): p is number => p !== null);

    // Preload all stats for the display variable (for tooltip)
    for (const stat of manifest.stats) {
      fetchTile(displayVariable, stat, period);
      for (const adj of adjacent) {
        fetchTile(displayVariable, stat, adj);
      }
    }

    // Preload filter tiles for current + adjacent periods
    for (const f of filters) {
      fetchTile(f.variable, f.stat, period);
      for (const adj of adjacent) {
        fetchTile(f.variable, f.stat, adj);
      }
    }
  }, [period, manifest, displayVariable, filters]);
}
