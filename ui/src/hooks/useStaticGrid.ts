import { useState, useEffect, useRef } from "react";
import type { Manifest } from "../types";
import { fetchTile, setManifest } from "../lib/tileCache";

export interface StaticCell {
  polygon: [number, number][];
  index: number;
  lon: number;
  lat: number;
}

function parseClippedShapes(buf: ArrayBuffer): Map<number, [number, number][][]> {
  const view = new DataView(buf);
  const count = view.getUint32(0, true);
  const map = new Map<number, [number, number][][]>();
  let offset = 4;

  for (let c = 0; c < count; c++) {
    const gridIdx = view.getUint32(offset, true); offset += 4;
    const nVerts = view.getUint16(offset, true); offset += 2;
    const polygon: [number, number][] = [];
    for (let v = 0; v < nVerts; v++) {
      const lon = view.getFloat32(offset, true); offset += 4;
      const lat = view.getFloat32(offset, true); offset += 4;
      polygon.push([lon, lat]);
    }
    const existing = map.get(gridIdx);
    if (existing) {
      existing.push(polygon);
    } else {
      map.set(gridIdx, [polygon]);
    }
  }

  return map;
}

function buildGrid(
  tile: Float32Array,
  manifest: Manifest,
  clipped: Map<number, [number, number][][]> | null,
): StaticCell[] {
  const { width, height, resolution_deg } = manifest.grid;
  const [lonStart] = manifest.lon_range;
  const [latStart] = manifest.lat_range;
  const half = resolution_deg / 2;
  const result: StaticCell[] = [];
  let nClipped = 0;

  for (let i = 0; i < width * height; i++) {
    if (Number.isNaN(tile[i])) continue;
    const latIdx = Math.floor(i / width);
    const lonIdx = i % width;
    let lon = lonStart + lonIdx * resolution_deg;
    if (lon > 180) lon -= 360;
    const lat = latStart - latIdx * resolution_deg;
    if (lat < -85 || lat > 85) continue;

    const overrides = clipped?.get(i);
    if (overrides) {
      for (const polygon of overrides) {
        result.push({ polygon, index: i, lon, lat });
      }
      nClipped++;
    } else {
      const latLo = Math.max(-85, lat - half);
      const latHi = Math.min(85, lat + half);
      const polygon: [number, number][] = [
        [lon - half, latLo], [lon + half, latLo],
        [lon + half, latHi], [lon - half, latHi],
        [lon - half, latLo],
      ];
      result.push({ polygon, index: i, lon, lat });
    }
  }

  if (nClipped > 0) console.debug(`[staticGrid] ${nClipped} coastal cells use clipped shapes`);
  return result;
}

export function useStaticGrid(manifest: Manifest | null) {
  const [cells, setCells] = useState<StaticCell[] | null>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    if (!manifest || builtRef.current) return;

    setManifest(manifest);
    const firstVar = Object.keys(manifest.variables)[0];
    const firstPeriod = manifest.periods[0];

    let cancelled = false;

    const shapesUrl = `${import.meta.env.BASE_URL}tiles/tile_shapes.bin`;

    Promise.all([
      fetch(shapesUrl).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null),
      fetchTile(firstVar, "mean", firstPeriod),
    ]).then(([shapesBuf, tile]) => {
      if (cancelled || !tile || tile.length === 0) return;

      const t0 = performance.now();
      const clipped = shapesBuf ? parseClippedShapes(shapesBuf) : null;
      const result = buildGrid(tile, manifest, clipped);

      console.debug(
        `[staticGrid] Built ${result.length} polygons in ${(performance.now() - t0).toFixed(0)}ms` +
        (clipped ? ` (${clipped.size} clipped coastal shapes loaded)` : " (no clipped shapes)"),
      );
      builtRef.current = true;
      setCells(result);
    });

    return () => { cancelled = true; };
  }, [manifest]);

  return cells;
}
