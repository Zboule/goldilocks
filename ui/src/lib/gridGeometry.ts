export function indexToLonLat(
  index: number,
  gridWidth: number,
  gridHeight: number,
  lonRange: [number, number],
  latRange: [number, number],
): { lon: number; lat: number } {
  const latIdx = Math.floor(index / gridWidth);
  const lonIdx = index % gridWidth;

  const lonStep = (lonRange[1] - lonRange[0]) / (gridWidth - 1);
  const latStep = (latRange[1] - latRange[0]) / (gridHeight - 1);

  let lon = lonRange[0] + lonIdx * lonStep;
  if (lon > 180) lon -= 360;
  const lat = latRange[0] + latIdx * latStep;

  return { lon, lat };
}

export function lonLatToIndex(
  lon: number,
  lat: number,
  gridWidth: number,
  gridHeight: number,
  lonRange: [number, number],
  latRange: [number, number],
): number {
  if (lon < 0) lon += 360;
  const lonStep = (lonRange[1] - lonRange[0]) / (gridWidth - 1);
  const latStep = (latRange[1] - latRange[0]) / (gridHeight - 1);
  const lonIdx = Math.round((lon - lonRange[0]) / lonStep);
  const latIdx = Math.round((lat - latRange[0]) / latStep);
  return latIdx * gridWidth + lonIdx;
}

export function formatLat(lat: number): string {
  const abs = Math.abs(lat).toFixed(1);
  return lat >= 0 ? `${abs}°N` : `${abs}°S`;
}

export function formatLon(lon: number): string {
  const abs = Math.abs(lon).toFixed(1);
  return lon >= 0 ? `${abs}°E` : `${abs}°W`;
}

export function periodToLabel(period: number, labels: string[]): string {
  const idx = period - 1;
  if (idx >= 0 && idx < labels.length) return labels[idx];
  return `Period ${period}`;
}
