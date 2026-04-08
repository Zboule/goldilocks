import { useEffect } from "react";
import type { Manifest } from "../types";
import { fetchTile } from "../lib/tileCache";

export function usePreloadWeek(week: number, manifest: Manifest | null) {
  useEffect(() => {
    if (!manifest) return;

    for (const variable of Object.keys(manifest.variables)) {
      for (const stat of manifest.stats) {
        fetchTile(variable, stat, week);
      }
    }
  }, [week, manifest]);
}
