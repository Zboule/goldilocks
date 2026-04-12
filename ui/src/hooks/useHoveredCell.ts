import { useState, useCallback, useEffect, useRef } from "react";
import type { Manifest, Filter, HoveredCell, CellStats } from "../types";
import { getCachedValue, getLandArrayIndex, fetchChunkData, getDecodedChunkValue } from "../lib/tileCache";
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

function aggregateStat(stat: string, values: (number | null)[]): number | null {
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
  const lastInfoRef = useRef<HoverInput | null>(null);

  const seqRef = useRef(0);

  const updateCell = useCallback(
    (info: HoverInput | null) => {
      lastInfoRef.current = info;
      const currentSeq = ++seqRef.current;

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

      getLandArrayIndex(info.index).then(async (landIdx) => {
        if (landIdx === -1) {
          if (seqRef.current === currentSeq) setHoveredCell(null);
          return;
        }

        const useChunks = manifest.chunk_size && manifest.variable_order;

        if (useChunks) {
          await fetchChunkData(landIdx);
        }
        
        if (seqRef.current !== currentSeq) return;

        const varsToShow = useChunks 
          ? manifest.variable_order! 
          : Array.from(new Set([displayVariable, ...filters.map(f => f.variable)]));

        const data: CellStats[] = [];
        for (const varKey of varsToShow) {
          const varInfo = manifest.variables[varKey];
          if (!varInfo) continue;
          const stats: Record<string, number | null> = {};
          
          for (const stat of manifest.stats) {
            const perPeriod = periods.map((p) => {
               if (useChunks) {
                 const periodIdx = manifest.periods.indexOf(p);
                 if (periodIdx === -1) return null;
                 return getDecodedChunkValue(landIdx, varKey, stat, periodIdx);
               } else {
                 return getCachedValue(varKey, stat, p, info.index);
               }
            });
            stats[stat] = aggregateStat(stat, perPeriod as (number|null)[]);
          }
          
          if (Object.values(stats).some(v => v !== null)) {
            data.push({
              variable: varKey,
              label: varInfo.label,
              units: varInfo.units,
              stats,
            });
          }
        }

        const filterResults = filters.map((f) => {
          let allPass = true;
          for (const p of periods) {
            let value: number | null = null;
            if (useChunks) {
              const periodIdx = manifest.periods.indexOf(p);
              value = periodIdx !== -1 ? getDecodedChunkValue(landIdx, f.variable, f.stat, periodIdx) : null;
            } else {
              value = getCachedValue(f.variable, f.stat, p, info.index);
            }
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
      });
    },
    [manifest, periods, displayVariable, filters],
  );

  const onCellHover = useCallback(
    (info: HoverInput | null) => {
      updateCell(info);
    },
    [updateCell],
  );

  useEffect(() => {
    if (lastInfoRef.current) {
      updateCell(lastInfoRef.current);
    }
  }, [updateCell]);

  return { hoveredCell, onCellHover };
}
