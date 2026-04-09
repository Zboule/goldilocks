import type { Manifest } from "../types";

const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

let _manifest: Manifest | null = null;

export function setManifest(m: Manifest) {
  _manifest = m;
}

function makeKey(variable: string, stat: string, period: number): string {
  return `${variable}/${stat}/period${String(period).padStart(2, "0")}`;
}

function decodeUint16Tile(buf: ArrayBuffer, variable: string): Float32Array {
  const raw = new Uint16Array(buf);
  const out = new Float32Array(raw.length);

  const varInfo = _manifest?.variables[variable];
  const encMin = varInfo?.encode_min ?? varInfo?.min ?? 0;
  const encMax = varInfo?.encode_max ?? varInfo?.max ?? 1;
  const range = encMax - encMin;

  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    out[i] = v === 0 ? NaN : encMin + ((v - 1) / 65534) * range;
  }
  return out;
}

export async function fetchTile(
  variable: string,
  stat: string,
  period: number,
): Promise<Float32Array> {
  const key = makeKey(variable, stat, period);

  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetch(`/tiles/${key}.bin`)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const encoding = _manifest?.encoding ?? "float32";
      const data =
        encoding === "uint16"
          ? decodeUint16Tile(buf, variable)
          : new Float32Array(buf);
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
  period: number,
): Float32Array | null {
  return cache.get(makeKey(variable, stat, period)) ?? null;
}

export function getCachedValue(
  variable: string,
  stat: string,
  period: number,
  index: number,
): number | null {
  const tile = getCached(variable, stat, period);
  if (!tile || index < 0 || index >= tile.length) return null;
  const v = tile[index];
  return Number.isNaN(v) ? null : v;
}
