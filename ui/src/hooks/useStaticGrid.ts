import { useState, useEffect, useRef } from "react";
import type { Manifest } from "../types";
import { fetchTile, setManifest } from "../lib/tileCache";

export interface StaticCell {
  polygon: [number, number][];
  index: number;
  lon: number;
  lat: number;
}

export function useStaticGrid(manifest: Manifest | null) {
  const [cells, setCells] = useState<StaticCell[] | null>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    if (!manifest || builtRef.current) return;

    setManifest(manifest);
    const { width, height, resolution_deg } = manifest.grid;
    const [lonStart] = manifest.lon_range;
    const [latStart] = manifest.lat_range;
    const half = resolution_deg / 2;

    const firstVar = Object.keys(manifest.variables)[0];
    const firstPeriod = manifest.periods[0];

    let cancelled = false;

    fetchTile(firstVar, "mean", firstPeriod).then((tile) => {
      if (cancelled || !tile || tile.length === 0) return;

      const t0 = performance.now();
      const result: StaticCell[] = [];

      for (let i = 0; i < width * height; i++) {
        if (Number.isNaN(tile[i])) continue;

        const latIdx = Math.floor(i / width);
        const lonIdx = i % width;
        let lon = lonStart + lonIdx * resolution_deg;
        if (lon > 180) lon -= 360;
        const lat = latStart - latIdx * resolution_deg;

        if (lat < -85 || lat > 85) continue;
        const latLo = Math.max(-85, lat - half);
        const latHi = Math.min(85, lat + half);
        const polygon: [number, number][] = [
          [lon - half, latLo],
          [lon + half, latLo],
          [lon + half, latHi],
          [lon - half, latHi],
          [lon - half, latLo],
        ];

        result.push({ polygon, index: i, lon, lat });
      }

      console.debug(`[staticGrid] Built ${result.length} polygons in ${(performance.now() - t0).toFixed(0)}ms`);
      builtRef.current = true;
      setCells(result);
    });

    return () => { cancelled = true; };
  }, [manifest]);

  return cells;
}
