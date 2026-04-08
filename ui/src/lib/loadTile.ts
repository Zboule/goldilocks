import { getColor } from "./colorScale";

export interface GridCell {
  lon: number;
  lat: number;
  value: number;
  color: [number, number, number, number];
}

const tileCache = new Map<string, Float32Array>();

export async function loadTile(
  variable: string,
  stat: string,
  week: number,
): Promise<Float32Array> {
  const key = `${variable}/${stat}/week${String(week).padStart(2, "0")}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

  const resp = await fetch(`/tiles/${key}.bin`);
  const buf = await resp.arrayBuffer();
  const data = new Float32Array(buf);
  tileCache.set(key, data);
  return data;
}

const GRAY_OUT: [number, number, number, number] = [180, 180, 180, 120];

export function buildGridCells(
  data: Float32Array,
  variable: string,
  min: number,
  max: number,
  gridWidth: number,
  gridHeight: number,
  lonStart: number,
  latStart: number,
  resolution: number,
  limitMin?: number,
  limitMax?: number,
): GridCell[] {
  const cells: GridCell[] = [];
  const lo = limitMin ?? -Infinity;
  const hi = limitMax ?? Infinity;

  for (let latIdx = 0; latIdx < gridHeight; latIdx++) {
    for (let lonIdx = 0; lonIdx < gridWidth; lonIdx++) {
      const value = data[latIdx * gridWidth + lonIdx];
      if (Number.isNaN(value)) continue;

      let lon = lonStart + lonIdx * resolution;
      if (lon > 180) lon -= 360;

      const lat = latStart + latIdx * resolution;
      const outOfRange = value < lo || value > hi;
      const color = outOfRange
        ? GRAY_OUT
        : getColor(variable, value, min, max);

      cells.push({ lon, lat, value, color });
    }
  }

  return cells;
}
