import type { Manifest } from "../types";

const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

const chunkCache = new Map<string, Uint8Array>();
const chunkInflight = new Map<string, Promise<Uint8Array>>();

let _manifest: Manifest | null = null;
let _landIndex: Uint32Array | null = null;
let _landIndexPromise: Promise<Uint32Array> | null = null;
let _gridToLand: Int32Array | null = null;

let _manifestVersion = 0;

// --- Fetch queue: limits concurrent network requests ---
const MAX_CONCURRENT = 12;
let _activeCount = 0;
const _queue: Array<{ run: () => void }> = [];

function queuedFetch(url: string): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const run = () => {
      _activeCount++;
      _notifyInflight();
      fetch(url)
        .then(resolve, reject)
        .finally(() => {
          _activeCount--;
          _notifyInflight();
          if (_queue.length > 0) _queue.shift()!.run();
        });
    };
    if (_activeCount < MAX_CONCURRENT) run();
    else _queue.push({ run });
  });
}

// --- Persistent Cache API for .bin files ---
const CACHE_NAME = "goldilocks-tiles-v1";
let _cacheStorage: Cache | null = null;
let _cacheReady: Promise<Cache | null> | null = null;

function getCache(): Promise<Cache | null> {
  if (_cacheStorage) return Promise.resolve(_cacheStorage);
  if (_cacheReady) return _cacheReady;
  if (typeof caches === "undefined") return Promise.resolve(null);
  _cacheReady = caches.open(CACHE_NAME).then((c) => { _cacheStorage = c; return c; }).catch(() => null);
  return _cacheReady;
}

async function cachedFetch(url: string): Promise<Response> {
  const c = await getCache();
  if (c) {
    const hit = await c.match(url);
    if (hit) return hit;
  }
  const resp = await queuedFetch(url);
  if (resp.ok && c) {
    c.put(url, resp.clone()).catch(() => {});
  }
  return resp;
}

// --- Inflight tracking for UI loading indicators ---
const _inflightPeriods = new Set<number>();
type InflightListener = () => void;
const _inflightListeners = new Set<InflightListener>();

function _notifyInflight() {
  for (const fn of _inflightListeners) fn();
}

export function onInflightChange(fn: InflightListener): () => void {
  _inflightListeners.add(fn);
  return () => _inflightListeners.delete(fn);
}

export function getInflightPeriods(): Set<number> {
  return new Set(_inflightPeriods);
}

function addInflightPeriod(period: number) {
  _inflightPeriods.add(period);
  _notifyInflight();
}

function removeInflightPeriod(period: number) {
  _inflightPeriods.delete(period);
  _notifyInflight();
}

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

  _landIndexPromise = cachedFetch(`${import.meta.env.BASE_URL}tiles/land_bitmap.bin`)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const bitmap = new Uint8Array(buf);
      const gridSize = _manifest?.grid
        ? _manifest.grid.width * _manifest.grid.height
        : bitmap.length * 8;
      const indices: number[] = [];
      for (let i = 0; i < gridSize; i++) {
        if (bitmap[i >> 3] & (1 << (i & 7))) {
          indices.push(i);
        }
      }
      _landIndex = new Uint32Array(indices);
      _gridToLand = new Int32Array(gridSize).fill(-1);
      for (let i = 0; i < _landIndex.length; i++) {
        _gridToLand[_landIndex[i]] = i;
      }
      return _landIndex;
    });

  return _landIndexPromise;
}

export async function getLandArrayIndex(gridIndex: number): Promise<number> {
  await getLandIndex();
  if (!_gridToLand || gridIndex < 0 || gridIndex >= _gridToLand.length) return -1;
  return _gridToLand[gridIndex];
}

export async function fetchChunkData(landArrayIndex: number, periodIdx: number): Promise<Uint8Array | null> {
  if (!_manifest || !_manifest.chunk_size) return null;
  const chunkSize = _manifest.chunk_size;
  const chunkId = Math.floor(landArrayIndex / chunkSize);
  const periodNum = _manifest.periods[periodIdx] ?? periodIdx + 1;
  const cacheKey = `${periodNum}/${chunkId}`;

  if (chunkCache.has(cacheKey)) return chunkCache.get(cacheKey)!;
  if (chunkInflight.has(cacheKey)) return chunkInflight.get(cacheKey)!;

  const promise = (async () => {
    try {
      const url = `${import.meta.env.BASE_URL}tiles/cell_chunks/period${String(periodNum).padStart(2, '0')}/chunk_${String(chunkId).padStart(4, '0')}.bin`;
      const resp = await cachedFetch(url);
      if (!resp.ok) return new Uint8Array(0);
      const buf = await resp.arrayBuffer();
      const data = new Uint8Array(buf);
      chunkCache.set(cacheKey, data);
      return data;
    } catch {
      return new Uint8Array(0);
    } finally {
      chunkInflight.delete(cacheKey);
    }
  })();
  chunkInflight.set(cacheKey, promise);
  return promise;
}

export async function fetchChunkDataForPeriods(landArrayIndex: number, periodIndices: number[]): Promise<void> {
  await Promise.all(periodIndices.map((pi) => fetchChunkData(landArrayIndex, pi)));
}

export function areChunksCached(landArrayIndex: number, periodIndices: number[]): boolean {
  if (!_manifest || !_manifest.chunk_size) return false;
  const chunkSize = _manifest.chunk_size;
  const chunkId = Math.floor(landArrayIndex / chunkSize);
  return periodIndices.every((pi) => {
    const periodNum = _manifest!.periods[pi] ?? pi + 1;
    return chunkCache.has(`${periodNum}/${chunkId}`);
  });
}

export function isLandIndexReady(): boolean {
  return _landIndex !== null && _gridToLand !== null;
}

export function getLandArrayIndexSync(gridIndex: number): number {
  if (!_gridToLand || gridIndex < 0 || gridIndex >= _gridToLand.length) return -1;
  return _gridToLand[gridIndex];
}

function getCachedChunkData(landArrayIndex: number, periodIdx: number): Uint8Array | null {
  if (!_manifest || !_manifest.chunk_size) return null;
  const chunkSize = _manifest.chunk_size;
  const chunkId = Math.floor(landArrayIndex / chunkSize);
  const periodNum = _manifest.periods[periodIdx] ?? periodIdx + 1;
  return chunkCache.get(`${periodNum}/${chunkId}`) ?? null;
}

export function getDecodedChunkValue(
  landArrayIndex: number,
  varName: string,
  statName: string,
  periodIdx: number,
): number | null {
  if (!_manifest || !_manifest.chunk_size || !_manifest.variable_order) return null;

  const chunkData = getCachedChunkData(landArrayIndex, periodIdx);
  if (!chunkData || chunkData.length === 0) return null;

  const varIdx = _manifest.variable_order.indexOf(varName);
  const statIdx = _manifest.stats.indexOf(statName);
  if (varIdx === -1 || statIdx === -1) return null;

  const numVars = _manifest.variable_order.length;
  const numStats = _manifest.stats.length;

  const chunkSize = _manifest.chunk_size;
  const offsetInChunk = landArrayIndex % chunkSize;

  const byteOffset =
    offsetInChunk * (numVars * numStats) +
    varIdx * numStats +
    statIdx;

  if (byteOffset >= chunkData.length) return null;
  const raw = chunkData[byteOffset];
  if (raw === 0) return null;

  const varInfo = _manifest.variables[varName];
  const encMin = varInfo?.encode_min ?? varInfo?.min ?? 0;
  const encMax = varInfo?.encode_max ?? varInfo?.max ?? 1;
  return encMin + ((raw - 1) / 254) * (encMax - encMin);
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
    addInflightPeriod(period);
    try {
      const url = `${import.meta.env.BASE_URL}tiles/${key}.bin`;
      const resp = await cachedFetch(url);
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
      return data;
    } finally {
      inflight.delete(key);
      removeInflightPeriod(period);
    }
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
