import { useEffect } from "react";
import type { Manifest, Filter } from "../types";
import { fetchTile } from "../lib/tileCache";

const CORE_STATS = ["mean", "p10", "p90"];

export function usePreloadPeriod(
  period: number,
  manifest: Manifest | null,
  displayVariable: string,
  displayStat: string,
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

    // Core stats for display variable (for tooltip)
    for (const stat of CORE_STATS) {
      fetchTile(displayVariable, stat, period);
      for (const adj of adjacent) {
        fetchTile(displayVariable, stat, adj);
      }
    }

    // If display stat is non-core, load it too
    if (!CORE_STATS.includes(displayStat)) {
      fetchTile(displayVariable, displayStat, period);
      for (const adj of adjacent) {
        fetchTile(displayVariable, displayStat, adj);
      }
    }

    // Filter tiles for current + adjacent periods
    for (const f of filters) {
      fetchTile(f.variable, f.stat, period);
      for (const adj of adjacent) {
        fetchTile(f.variable, f.stat, adj);
      }
    }
  }, [period, manifest, displayVariable, displayStat, filters]);
}
