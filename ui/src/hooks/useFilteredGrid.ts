import { useMemo } from "react";
import type { Manifest, Filter, TileRequest, GridCell } from "../types";
import { useTiles } from "./useTiles";
import { getFilterTileRequests } from "../lib/filterEngine";
import { getColor, GRAY_COLOR } from "../lib/colorScale";
import { indexToLonLat } from "../lib/gridGeometry";

export function useFilteredGrid(
  manifest: Manifest | null,
  displayVariable: string,
  displayStat: string,
  filters: Filter[],
  period: number,
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

  const { tiles, loading } = useTiles(tileRequests, period);

  const cells = useMemo<GridCell[]>(() => {
    if (!manifest || loading) return [];

    const displayTile = tiles.get(`${displayVariable}/${displayStat}`);
    if (!displayTile) return [];

    const { width, height, resolution_deg } = manifest.grid;
    const varInfo = manifest.variables[displayVariable];
    const totalCells = width * height;
    const result: GridCell[] = [];

    for (let i = 0; i < totalCells; i++) {
      const value = displayTile[i];
      if (Number.isNaN(value)) continue;

      let allPass = true;
      for (const f of filters) {
        const tile = tiles.get(`${f.variable}/${f.stat}`);
        if (!tile) {
          allPass = false;
          break;
        }
        const v = tile[i];
        if (Number.isNaN(v)) {
          allPass = false;
          break;
        }
        const passes =
          f.operator === "<" ? v < f.value : v > f.value;
        if (!passes) {
          allPass = false;
          break;
        }
      }

      const { lon, lat } = indexToLonLat(
        i, width, height, manifest.lon_range, manifest.lat_range,
      );

      const half = resolution_deg / 2;
      const latLo = Math.max(-89.9, lat - half);
      const latHi = Math.min(89.9, lat + half);
      const polygon: [number, number][] = [
        [lon - half, latLo],
        [lon + half, latLo],
        [lon + half, latHi],
        [lon - half, latHi],
        [lon - half, latLo],
      ];

      const color = allPass
        ? getColor(displayVariable, value, varInfo.display_min, varInfo.display_max)
        : GRAY_COLOR;

      result.push({ lon, lat, index: i, value, color, polygon, passesFilter: allPass });
    }

    return result;
  }, [manifest, tiles, loading, displayVariable, displayStat, filters]);

  return { cells, loading };
}
