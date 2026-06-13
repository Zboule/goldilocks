import { useEffect } from "react";
import type { Manifest, Filter } from "../types";
import { fetchTile } from "../lib/tileCache";

const CORE_STATS = ["mean", "p10", "p90"];

export function usePreloadPeriods(
  selectedPeriods: number[],
  manifest: Manifest | null,
  displayVariable: string,
  displayStat: string,
  filters: Filter[],
) {
  useEffect(() => {
    if (!manifest || selectedPeriods.length === 0) return;

    const allPeriods = manifest.periods;
    const n = allPeriods.length;

    // Current selection: also warm the core stats so switching Mean/P10/P90 is
    // instant on what's on screen.
    for (const period of selectedPeriods) {
      for (const stat of CORE_STATS) {
        fetchTile(displayVariable, stat, period);
      }
      if (!CORE_STATS.includes(displayStat)) {
        fetchTile(displayVariable, displayStat, period);
      }
      for (const f of filters) {
        fetchTile(f.variable, f.stat, period);
      }
    }

    // Look-ahead window (prev 1, next 2, wrapping) so Play advances without a
    // visible loading flash. Only the tiles needed to RENDER each period — the
    // displayed stat + active filters — to keep the prefetch memory lean.
    const lookAhead = new Set<number>();
    for (const p of selectedPeriods) {
      const idx = allPeriods.indexOf(p);
      if (idx < 0) continue;
      for (const d of [-1, 1, 2]) {
        lookAhead.add(allPeriods[((idx + d) % n + n) % n]);
      }
    }
    for (const p of selectedPeriods) lookAhead.delete(p);

    for (const period of lookAhead) {
      fetchTile(displayVariable, displayStat, period);
      for (const f of filters) {
        fetchTile(f.variable, f.stat, period);
      }
    }
  }, [selectedPeriods, manifest, displayVariable, displayStat, filters]);
}
