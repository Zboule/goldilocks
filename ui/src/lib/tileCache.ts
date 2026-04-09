import type { Manifest } from "../types";

const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

let _manifest: Manifest | null = null;
let _landIndex: Uint32Array | null = null;
let _landIndexPromise: Promise<Uint32Array> | null = null;

export function setManifest(m: Manifest) {
  _manifest = m;
}

async function getLandIndex(): Promise<Uint32Array> {
  if (_landIndex) return _landIndex;
  if (_landIndexPromise) return _landIndexPromise;

  _landIndexPromise = fetch("/tiles/land_index.bin")
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      _landIndex = new Uint32Array(buf);
      return _landIndex;
    });

  return _landIndexPromise;
}

function makeKey(variable: string, stat: string, period: number): string {
  return `${variable}/${stat}/period${String(period).padStart(2, "0")}`;
}

function decodeLandOnlyUint8(
  uint8: Uint8Array,
  landIndex: Uint32Array,
  gridSize: number,
  encMin: number,
  encMax: number,
): Float32Array {
  const full = new Float32Array(gridSize).fill(NaN);
  const range = encMax - encMin;
  for (let i = 0; i < landIndex.length; i++) {
    const raw = uint8[i];
    if (raw === 0) continue;
    full[landIndex[i]] = encMin + ((raw - 1) / 254) * range;
  }
  return full;
}

function decodeUint16(buf: ArrayBuffer, variable: string, gridSize: number): Float32Array {
  const raw = new Uint16Array(buf);
  const out = new Float32Array(gridSize).fill(NaN);
  const varInfo = _manifest?.variables[variable];
  const encMin = varInfo?.encode_min ?? varInfo?.min ?? 0;
  const encMax = varInfo?.encode_max ?? varInfo?.max ?? 1;
  const range = encMax - encMin;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0) continue;
    out[i] = encMin + ((raw[i] - 1) / 65534) * range;
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

  const encoding = _manifest?.encoding ?? "float32";
  const gridSize = _manifest
    ? _manifest.grid.width * _manifest.grid.height
    : 0;

  const promise = (async () => {
    const buf = await fetch(`/tiles/${key}.bin`).then((r) => r.arrayBuffer());
    let data: Float32Array;

    if (encoding === "uint8-land-only") {
      const landIndex = await getLandIndex();
      const varInfo = _manifest?.variables[variable];
      const encMin = varInfo?.encode_min ?? varInfo?.min ?? 0;
      const encMax = varInfo?.encode_max ?? varInfo?.max ?? 1;
      data = decodeLandOnlyUint8(new Uint8Array(buf), landIndex, gridSize, encMin, encMax);
    } else if (encoding === "uint16") {
      data = decodeUint16(buf, variable, gridSize);
    } else {
      data = new Float32Array(buf);
    }

    cache.set(key, data);
    inflight.delete(key);
    return data;
  })();

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
