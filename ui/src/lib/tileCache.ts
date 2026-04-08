const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

function makeKey(variable: string, stat: string, week: number): string {
  return `${variable}/${stat}/week${String(week).padStart(2, "0")}`;
}

export async function fetchTile(
  variable: string,
  stat: string,
  week: number,
): Promise<Float32Array> {
  const key = makeKey(variable, stat, week);

  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetch(`/tiles/${key}.bin`)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const data = new Float32Array(buf);
      cache.set(key, data);
      inflight.delete(key);
      return data;
    });

  inflight.set(key, promise);
  return promise;
}

export function getCached(
  variable: string,
  stat: string,
  week: number,
): Float32Array | null {
  return cache.get(makeKey(variable, stat, week)) ?? null;
}

export function getCachedValue(
  variable: string,
  stat: string,
  week: number,
  index: number,
): number | null {
  const tile = getCached(variable, stat, week);
  if (!tile || index < 0 || index >= tile.length) return null;
  const v = tile[index];
  return Number.isNaN(v) ? null : v;
}
