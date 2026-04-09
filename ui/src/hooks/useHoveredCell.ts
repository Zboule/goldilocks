import { useState, useCallback } from "react";
import type { Manifest, Filter, HoveredCell, CellStats } from "../types";
import { getCachedValue } from "../lib/tileCache";
import { evaluateFilter, describeFilter } from "../lib/filterEngine";
import { indexToLonLat } from "../lib/gridGeometry";

const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Median",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
};

interface HoverInput {
  index: number;
  x: number;
  y: number;
}

export function useHoveredCell(
  manifest: Manifest | null,
  period: number,
  displayVariable: string,
  filters: Filter[],
) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);

  const onCellHover = useCallback(
    (info: HoverInput | null) => {
      if (!info || !manifest) {
        setHoveredCell(null);
        return;
      }

      const { width, resolution_deg } = manifest.grid;
      const [lonStart] = manifest.lon_range;
      const [latStart] = manifest.lat_range;
      const { lon, lat } = indexToLonLat(
        info.index, width, lonStart, latStart, resolution_deg,
      );

      // Collect variables to show: display var + filter vars (deduplicated)
      const varsToShow = new Set<string>([displayVariable]);
      for (const f of filters) {
        varsToShow.add(f.variable);
      }

      const data: CellStats[] = [];
      for (const varKey of varsToShow) {
        const varInfo = manifest.variables[varKey];
        if (!varInfo) continue;
        const stats: Record<string, number | null> = {};
        for (const stat of manifest.stats) {
          stats[stat] = getCachedValue(varKey, stat, period, info.index);
        }
        data.push({
          variable: varKey,
          label: varInfo.label,
          units: varInfo.units,
          stats,
        });
      }

      const filterResults = filters.map((f) => {
        const value = getCachedValue(f.variable, f.stat, period, info.index);
        const passes = evaluateFilter(f, value);
        const varInfo = manifest.variables[f.variable];
        const label = describeFilter(
          f,
          varInfo?.label ?? f.variable,
          STAT_LABELS[f.stat] ?? f.stat,
          varInfo?.units ?? "",
        );
        return { filterId: f.id, variable: f.variable, stat: f.stat, label, passes };
      });

      setHoveredCell({
        x: info.x,
        y: info.y,
        lon,
        lat,
        index: info.index,
        data,
        filterResults,
      });
    },
    [manifest, period, displayVariable, filters],
  );

  return { hoveredCell, onCellHover };
}
