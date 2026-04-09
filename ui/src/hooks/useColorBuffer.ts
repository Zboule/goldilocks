import { useMemo, useRef } from "react";
import type { Manifest, Filter, TileRequest } from "../types";
import { useTiles } from "./useTiles";
import { getFilterTileRequests } from "../lib/filterEngine";
import { getColor, GRAY_COLOR } from "../lib/colorScale";
import type { StaticCell } from "./useStaticGrid";

export function useColorBuffer(
  manifest: Manifest | null,
  cells: StaticCell[] | null,
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

  const { tiles, loading } = useTiles(tileRequests, period, !!manifest);

  const versionRef = useRef(0);

  const { colors, version } = useMemo(() => {
    if (!manifest || !cells || loading || cells.length === 0) {
      return { colors: null, version: versionRef.current };
    }

    const t0 = performance.now();
    const displayTile = tiles.get(`${displayVariable}/${displayStat}`);
    if (!displayTile || displayTile.length === 0) {
      return { colors: null, version: versionRef.current };
    }

    const varInfo = manifest.variables[displayVariable];
    const buf = new Uint8Array(cells.length * 4);

    for (let ci = 0; ci < cells.length; ci++) {
      const gridIdx = cells[ci].index;
      const value = displayTile[gridIdx];

      let allPass = true;
      if (!Number.isNaN(value)) {
        for (const f of filters) {
          const tile = tiles.get(`${f.variable}/${f.stat}`);
          if (!tile) { allPass = false; break; }
          const v = tile[gridIdx];
          if (Number.isNaN(v)) { allPass = false; break; }
          const passes = f.operator === "<" ? v < f.value : v > f.value;
          if (!passes) { allPass = false; break; }
        }
      }

      const color = Number.isNaN(value)
        ? [0, 0, 0, 0]
        : allPass
          ? getColor(displayVariable, value, varInfo.display_min, varInfo.display_max)
          : GRAY_COLOR;

      const off = ci * 4;
      buf[off] = color[0];
      buf[off + 1] = color[1];
      buf[off + 2] = color[2];
      buf[off + 3] = color[3];
    }

    versionRef.current++;
    return { colors: buf, version: versionRef.current };
  }, [manifest, cells, tiles, loading, displayVariable, displayStat, filters]);

  return { colors, version, loading };
}
