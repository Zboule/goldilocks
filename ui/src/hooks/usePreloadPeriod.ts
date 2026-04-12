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
    const adjacentSet = new Set<number>();

    for (const p of selectedPeriods) {
      const idx = allPeriods.indexOf(p);
      if (idx > 0) adjacentSet.add(allPeriods[idx - 1]);
      if (idx < allPeriods.length - 1) adjacentSet.add(allPeriods[idx + 1]);
    }

    const periodsToPreload = [...new Set([...selectedPeriods, ...adjacentSet])];

    for (const period of periodsToPreload) {
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
  }, [selectedPeriods, manifest, displayVariable, displayStat, filters]);
}
