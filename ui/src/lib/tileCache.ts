import type { Manifest } from "../types";

const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

const chunkCache = new Map<number, Uint8Array>();
const chunkInflight = new Map<number, Promise<Uint8Array>>();

let _manifest: Manifest | null = null;
let _landIndex: Uint32Array | null = null;
let _landIndexPromise: Promise<Uint32Array> | null = null;

let _manifestVersion = 0;

export function setManifest(m: Manifest) {
  _manifest = m;
  _manifestVersion++;
}

export function getManifestVersion(): number {
  return _manifestVersion;
}

async function getLandIndex(): Promise<Uint32Array> {
  if (_landIndex) return _landIndex;
  if (_landIndexPromise) return _landIndexPromise;

  _landIndexPromise = fetch(`${import.meta.env.BASE_URL}tiles/land_index.bin`)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      _landIndex = new Uint32Array(buf);
      return _landIndex;
    });

  return _landIndexPromise;
}

export async function getLandArrayIndex(gridIndex: number): Promise<number> {
  const landIndex = await getLandIndex();
  let low = 0;
  let high = landIndex.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const val = landIndex[mid];
    if (val === gridIndex) return mid;
    if (val < gridIndex) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export async function fetchChunkData(landArrayIndex: number): Promise<Uint8Array | null> {
  if (!_manifest || !_manifest.chunk_size) return null;
  const chunkSize = _manifest.chunk_size;
  const chunkId = Math.floor(landArrayIndex / chunkSize);
  
  if (chunkCache.has(chunkId)) return chunkCache.get(chunkId)!;
  if (chunkInflight.has(chunkId)) return chunkInflight.get(chunkId)!;
  
  const promise = (async () => {
    try {
      const url = `${import.meta.env.BASE_URL}tiles/cell_chunks/chunk_${String(chunkId).padStart(4, '0')}.bin`;
      const resp = await fetch(url);
      if (!resp.ok) return new Uint8Array(0);
      const buf = await resp.arrayBuffer();
      const data = new Uint8Array(buf);
      chunkCache.set(chunkId, data);
      chunkInflight.delete(chunkId);
      return data;
    } catch {
      chunkInflight.delete(chunkId);
      return new Uint8Array(0);
    }
  })();
  chunkInflight.set(chunkId, promise);
  return promise;
}

export function getCachedChunkData(landArrayIndex: number): Uint8Array | null {
  if (!_manifest || !_manifest.chunk_size) return null;
  const chunkSize = _manifest.chunk_size;
  const chunkId = Math.floor(landArrayIndex / chunkSize);
  return chunkCache.get(chunkId) ?? null;
}

export function getDecodedChunkValue(
  landArrayIndex: number,
  varName: string,
  statName: string,
  periodIdx: number,
): number | null {
  if (!_manifest || !_manifest.chunk_size || !_manifest.variable_order) return null;
  
  const chunkData = getCachedChunkData(landArrayIndex);
  if (!chunkData) return null;

  const varIdx = _manifest.variable_order.indexOf(varName);
  const statIdx = _manifest.stats.indexOf(statName);
  if (varIdx === -1 || statIdx === -1) return null;

  const numVars = _manifest.variable_order.length;
  const numStats = _manifest.stats.length;
  const numPeriods = _manifest.periods.length;
  
  const chunkSize = _manifest.chunk_size;
  const offsetInChunk = landArrayIndex % chunkSize;
  
  const byteOffset = 
    offsetInChunk * (numVars * numStats * numPeriods) +
    varIdx * (numStats * numPeriods) +
    statIdx * numPeriods +
    periodIdx;

  if (byteOffset >= chunkData.length) return null;
  const raw = chunkData[byteOffset];
  if (raw === 0) return null;

  const varInfo = _manifest.variables[varName];
  const encMin = varInfo?.encode_min ?? varInfo?.min ?? 0;
  const encMax = varInfo?.encode_max ?? varInfo?.max ?? 1;
  const range = encMax - encMin;
  
  return encMin + ((raw - 1) / 254) * range;
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

  if (!_manifest) {
    return Promise.resolve(new Float32Array(0));
  }

  const encoding = _manifest.encoding ?? "float32";
  const gridSize = _manifest.grid.width * _manifest.grid.height;

  const promise = (async () => {
    const resp = await fetch(`${import.meta.env.BASE_URL}tiles/${key}.bin`);
    const buf = await resp.arrayBuffer();

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
