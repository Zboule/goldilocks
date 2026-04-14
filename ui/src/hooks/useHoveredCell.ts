import { useState, useCallback, useEffect, useRef } from "react";
import type { Manifest, Filter, HoveredCell, CellStats } from "../types";
import {
  getCachedValue, getLandArrayIndex, fetchChunkDataForPeriods,
  getDecodedChunkValue, areChunksCached, isLandIndexReady, getLandArrayIndexSync,
  getCountryForLandCellSync, getCountryForLandCell, isCountryDataReady,
} from "../lib/tileCache";
import { evaluateFilter, describeFilter } from "../lib/filterEngine";
import { indexToLonLat } from "../lib/gridGeometry";

const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Median",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
  ystd: "Year Std",
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

  const buildCellData = useCallback(
    (info: HoverInput, landIdx: number) => {
      if (!manifest) return { data: [] as CellStats[], filterResults: [] as HoveredCell["filterResults"] };

      const useChunks = manifest.chunk_size && manifest.variable_order;
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
          stats[stat] = aggregateStat(stat, perPeriod as (number | null)[]);
        }

        data.push({ variable: varKey, label: varInfo.label, units: varInfo.units, stats });
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
        const label = describeFilter(f, varInfo?.label ?? f.variable, STAT_LABELS[f.stat] ?? f.stat, varInfo?.units ?? "");
        return { filterId: f.id, variable: f.variable, stat: f.stat, label, passes: allPass };
      });

      return { data, filterResults };
    },
    [manifest, periods, displayVariable, filters],
  );

  const buildSkeleton = useCallback(
    (): CellStats[] => {
      if (!manifest) return [];
      const vars = manifest.variable_order ?? Object.keys(manifest.variables);
      return vars.map((varKey) => {
        const varInfo = manifest.variables[varKey];
        const stats: Record<string, number | null> = {};
        for (const stat of manifest.stats) stats[stat] = null;
        return { variable: varKey, label: varInfo?.label ?? varKey, units: varInfo?.units ?? "", stats };
      });
    },
    [manifest],
  );

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

      const baseCell = { x: info.x, y: info.y, lon, lat, index: info.index };
      const periodIndices = periods.map((p) => manifest.periods.indexOf(p)).filter((i) => i !== -1);
      const useChunks = manifest.chunk_size && manifest.variable_order;

      // Fast sync path: land index ready + chunks cached → no loading state
      if (isLandIndexReady()) {
        const landIdx = getLandArrayIndexSync(info.index);
        if (landIdx === -1) { setHoveredCell(null); return; }

        if (!useChunks || areChunksCached(landIdx, periodIndices)) {
          const { data, filterResults } = buildCellData(info, landIdx);
          const country = isCountryDataReady() ? getCountryForLandCellSync(landIdx) : null;
          setHoveredCell({
            ...baseCell, data, filterResults, loading: false,
            ...(country ? { country } : {}),
          });
          return;
        }
      }

      // Async path: show skeleton, fetch, then fill
      setHoveredCell({ ...baseCell, data: buildSkeleton(), filterResults: [], loading: true });

      getLandArrayIndex(info.index).then(async (landIdx) => {
        if (landIdx === -1 || seqRef.current !== currentSeq) {
          if (seqRef.current === currentSeq) setHoveredCell(null);
          return;
        }

        const [, country] = await Promise.all([
          useChunks ? fetchChunkDataForPeriods(landIdx, periodIndices) : Promise.resolve(),
          getCountryForLandCell(landIdx),
        ]);
        if (seqRef.current !== currentSeq) return;

        const { data, filterResults } = buildCellData(info, landIdx);
        setHoveredCell({
          ...baseCell, data, filterResults, loading: false,
          ...(country ? { country } : {}),
        });
      });
    },
    [manifest, periods, displayVariable, filters, buildCellData, buildSkeleton],
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
