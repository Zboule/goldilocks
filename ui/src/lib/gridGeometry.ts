export function indexToLonLat(
  index: number,
  gridWidth: number,
  lonStart: number,
  latStart: number,
  resolution: number,
): { lon: number; lat: number } {
  const latIdx = Math.floor(index / gridWidth);
  const lonIdx = index % gridWidth;
  let lon = lonStart + lonIdx * resolution;
  if (lon > 180) lon -= 360;
  const lat = latStart + latIdx * resolution;
  return { lon, lat };
}

export function lonLatToIndex(
  lon: number,
  lat: number,
  gridWidth: number,
  lonStart: number,
  latStart: number,
  resolution: number,
): number {
  if (lon < 0) lon += 360;
  const lonIdx = Math.round((lon - lonStart) / resolution);
  const latIdx = Math.round((lat - latStart) / resolution);
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

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function weekToMonth(week: number): string {
  return MONTH_NAMES[Math.min(11, Math.floor((week - 1) / 4.33))];
}

export function weekToDateRange(week: number): string {
  const jan1 = new Date(Date.UTC(2025, 0, 1));
  const start = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d: Date) =>
    `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}
