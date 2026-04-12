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

function aggregateStat(stat: string, values: number[]): number | null {
  const valid = values.filter((v) => v !== null && !Number.isNaN(v)) as number[];
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  switch (stat) {
    case "max":
    case "p90":
      return Math.max(...valid);
    case "min":
    case "p10":
      return Math.min(...valid);
    case "mean":
    case "median":
    default:
      return valid.reduce((a, b) => a + b, 0) / valid.length;
  }
}

interface HoverInput {
  index: number;
  x: number;
  y: number;
}

export function useHoveredCell(
  manifest: Manifest | null,
  periods: number[],
  displayVariable: string,
  filters: Filter[],
) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);

  const onCellHover = useCallback(
    (info: HoverInput | null) => {
      if (!info || !manifest || periods.length === 0) {
        setHoveredCell(null);
        return;
      }

      const { width, resolution_deg } = manifest.grid;
      const [lonStart] = manifest.lon_range;
      const [latStart] = manifest.lat_range;
      const { lon, lat } = indexToLonLat(
        info.index, width, lonStart, latStart, resolution_deg,
      );

      // Check if there's any data at this cell
      const firstValue = getCachedValue(displayVariable, "mean", periods[0], info.index);
      if (firstValue === null) {
        setHoveredCell(null);
        return;
      }

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
          const perPeriod = periods.map((p) => getCachedValue(varKey, stat, p, info.index));
          stats[stat] = aggregateStat(stat, perPeriod as number[]);
        }
        data.push({
          variable: varKey,
          label: varInfo.label,
          units: varInfo.units,
          stats,
        });
      }

      const filterResults = filters.map((f) => {
        // Filter passes only if ALL periods pass
        let allPass = true;
        for (const p of periods) {
          const value = getCachedValue(f.variable, f.stat, p, info.index);
          if (!evaluateFilter(f, value)) { allPass = false; break; }
        }
        const varInfo = manifest.variables[f.variable];
        const label = describeFilter(
          f,
          varInfo?.label ?? f.variable,
          STAT_LABELS[f.stat] ?? f.stat,
          varInfo?.units ?? "",
        );
        return { filterId: f.id, variable: f.variable, stat: f.stat, label, passes: allPass };
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
    [manifest, periods, displayVariable, filters],
  );

  return { hoveredCell, onCellHover };
}
