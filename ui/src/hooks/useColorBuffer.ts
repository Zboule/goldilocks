import { useMemo, useRef } from "react";
import type { Manifest, Filter, TileRequest } from "../types";
import { useMultiPeriodTiles } from "./useMultiPeriodTiles";
import { evaluateFilter, getFilterTileRequests } from "../lib/filterEngine";
import { getColor, GRAY_COLOR, FIXED_DISPLAY_RANGE, YSTD_DISPLAY_MAX } from "../lib/colorScale";
import type { StaticCell } from "./useStaticGrid";

function aggregateStat(stat: string, values: number[]): number {
  if (values.length === 0) return NaN;
  if (values.length === 1) return values[0];

  switch (stat) {
    case "max":
    case "p90":
      return Math.max(...values);
    case "min":
    case "p10":
      return Math.min(...values);
    case "mean":
    case "median":
    default: {
      let sum = 0;
      for (const v of values) sum += v;
      return sum / values.length;
    }
  }
}

export function useColorBuffer(
  manifest: Manifest | null,
  cells: StaticCell[] | null,
  displayVariable: string,
  displayStat: string,
  filters: Filter[],
  periods: number[],
) {
  const tileRequests = useMemo<TileRequest[]>(() => {
    const filterReqs = getFilterTileRequests(filters);
    const displayKey = `${displayVariable}/${displayStat}`;
    const hasDisplay = filterReqs.some(
      (r) => `${r.variable}/${r.stat}` === displayKey,
    );
    if (!hasDisplay) {
      filterReqs.push({ variable: displayVariable, stat: displayStat });
    }
    return filterReqs;
  }, [filters, displayVariable, displayStat]);

  const { tilesPerPeriod, loading } = useMultiPeriodTiles(tileRequests, periods, !!manifest);

  const versionRef = useRef(0);

  const { colors, version } = useMemo(() => {
    if (!manifest || !cells || cells.length === 0 || periods.length === 0) {
      return { colors: null, version: versionRef.current };
    }

    const nPeriods = periods.length;
    const displayTiles = tilesPerPeriod.get(`${displayVariable}/${displayStat}`);
    const tilesReady = displayTiles && displayTiles.length >= nPeriods && displayTiles.every((t) => t && t.length > 0);

    if (loading || !tilesReady) {
      const buf = new Uint8Array(cells.length * 4);
      for (let ci = 0; ci < cells.length; ci++) {
        const off = ci * 4;
        buf[off] = GRAY_COLOR[0];
        buf[off + 1] = GRAY_COLOR[1];
        buf[off + 2] = GRAY_COLOR[2];
        buf[off + 3] = GRAY_COLOR[3];
      }
      versionRef.current++;
      return { colors: buf, version: versionRef.current };
    }

    const varInfo = manifest.variables[displayVariable];
    const isYstd = displayStat === "ystd";
    const fixedRange = FIXED_DISPLAY_RANGE[displayVariable];
    const colorMin = isYstd ? 0 : (fixedRange?.[0] ?? varInfo.display_min);
    const colorMax = isYstd ? (YSTD_DISPLAY_MAX[displayVariable] ?? 5) : (fixedRange?.[1] ?? varInfo.display_max);
    const buf = new Uint8Array(cells.length * 4);

    for (let ci = 0; ci < cells.length; ci++) {
      const gridIdx = cells[ci].index;

      const displayValues: number[] = [];
      let anyNaN = false;
      for (let pi = 0; pi < nPeriods; pi++) {
        const v = displayTiles[pi][gridIdx];
        if (Number.isNaN(v)) { anyNaN = true; break; }
        displayValues.push(v);
      }

      if (anyNaN || displayValues.length === 0) continue;

      let allPeriodsPass = true;
      for (const f of filters) {
        const filterTiles = tilesPerPeriod.get(`${f.variable}/${f.stat}`);
        if (!filterTiles || filterTiles.length < nPeriods) { allPeriodsPass = false; break; }

        for (let pi = 0; pi < nPeriods; pi++) {
          const v = filterTiles[pi]?.[gridIdx];
          if (!evaluateFilter(f, v ?? null)) { allPeriodsPass = false; break; }
        }
        if (!allPeriodsPass) break;
      }

      const aggregatedValue = aggregateStat(displayStat, displayValues);
      const color = allPeriodsPass
        ? getColor(displayVariable, aggregatedValue, colorMin, colorMax, displayStat)
        : GRAY_COLOR;

      const off = ci * 4;
      buf[off] = color[0];
      buf[off + 1] = color[1];
      buf[off + 2] = color[2];
      buf[off + 3] = color[3];
    }

    versionRef.current++;
    return { colors: buf, version: versionRef.current };
  }, [manifest, cells, tilesPerPeriod, loading, displayVariable, displayStat, filters, periods]);

  return { colors, version, loading };
}
