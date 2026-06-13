# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Goldilocks is a global climate explorer: a static React app that renders ERA5 climate statistics (2013–2023) on a deck.gl/MapLibre world map at 0.25° resolution (1440×721 grid), with 36 time periods per year (Early/Mid/Late per month) and user-defined filters to find places with "just right" weather.

## Commands

```bash
./setup.sh                 # one-time: download tiles from GitHub release, create symlink, pnpm install
cd ui && pnpm dev          # dev server (Vite)
cd ui && pnpm build        # typecheck (tsc -b) + production build — this is also the typecheck command
```

There are no tests and no lint setup. `pnpm build` is the only verification gate.

The UI requires tile data at `ui/public/tiles` (a symlink to `data/tiles`, both gitignored). If the map shows nothing, run `./setup.sh` (needs `gh` CLI). Tiles are versioned as GitHub release artifacts (currently `v2.2.1` — the tag is hardcoded in `setup.sh`, `README.md`, and `.github/workflows/deploy.yml`; update all three when releasing new tiles).

Deployment: push to `main` triggers GitHub Pages deploy (`.github/workflows/deploy.yml`). The Vite `base` becomes `/goldilocks/` under `GITHUB_ACTIONS` — always use `import.meta.env.BASE_URL` when fetching from `public/`, never absolute `/tiles/...` paths.

## Architecture

Two independent halves:

- `data/` — Python pipeline (run rarely, needs ~300 GB raw ERA5): `download_era5_025.py` → `process_periods_025.py` (NetCDF period stats) → `generate_tiles_025.py` (binary tiles + `manifest.json`). Land/ocean masking comes from Natural Earth 10m polygons, not ERA5.
- `ui/` — React 19 + TypeScript + Vite + Tailwind 4. No server; everything is static files fetched from `tiles/`.

### Tile data format (the contract between the two halves)

`manifest.json` drives everything: grid dimensions, periods, stats (`mean/median/min/max/p10/p90`), per-variable encoding ranges, and the `encoding` field. Current encoding is `uint8-land-only`:

- Each `tiles/{variable}/{stat}/period{NN}.bin` is a flat `Uint8Array` over **land cells only** (~384K cells, not the 1M full grid).
- `tiles/land_index.bin` (`Uint32Array`, sorted) maps land-array position → full-grid index.
- Byte value 0 = NaN; 1–255 maps linearly to `[encode_min, encode_max]`: `value = encode_min + ((raw - 1) / 254) * range`.
- `tiles/cell_chunks/chunk_NNNN.bin` holds per-cell tooltip data (all variables × stats × periods per cell, uint8, `chunk_size` cells per file, ordered by land-array index). Layout decode lives in `getDecodedChunkValue` in `tileCache.ts`. Note: the locally downloaded release may predate this — the code degrades gracefully (404 → empty tooltip).

The decoder in `ui/src/lib/tileCache.ts` also supports legacy `uint16` and `float32` encodings keyed off `manifest.encoding`. The README's "uint16" description is stale relative to the current manifest.

### UI data flow

`App.tsx` wires a pipeline of hooks around a module-level singleton cache (`lib/tileCache.ts` — `setManifest()` must be called before any fetch; tiles are cached forever by `variable/stat/period` key with in-flight dedup):

1. `useManifest` fetches `manifest.json`.
2. `useStaticGrid` builds the cell polygon list **once** from the first tile's NaN mask (land cells only). Polygons never change afterward; cell order in this array is the index space for the color buffer.
3. `useColorBuffer` is the core: collects tile requests (display variable + every filter's variable/stat), loads them for **all selected periods** via `useMultiPeriodTiles`, then computes one RGBA `Uint8Array` (4 bytes per static cell). A cell is grayed out unless it passes **all filters in every selected period**; display values are aggregated across periods (max/p90 → max, min/p10 → min, otherwise average).
4. `MapView` is deliberately outside the React render cycle: it exposes an imperative handle (`setPolygons`, `updateColors`) and re-renders the single deck.gl `PolygonLayer` via an incrementing `version` in `updateTriggers` — don't convert this to props/state, the polygon list (~384K cells) is too large to diff.
5. `useHoveredCell` resolves tooltips asynchronously: grid index → binary-search `land_index.bin` → fetch/decode the cell's chunk; uses a sequence counter to discard stale hovers.

### Period selection model

`usePeriodSelection` is a reducer with two notions: a set of **locked** periods (clicked twice / toggled) and one **active** period (hover/preview). `selectedPeriods` = locked ∪ active, and all downstream logic (colors, filters, tooltips) operates over that whole set. Clicking the active period locks it; clicking a locked period unlocks it.

### Filters

A `Filter` is `{variable, stat, operator: "<" | ">", value}` — only those two operators exist. Filter evaluation appears in two places that must stay consistent: the hot loop inside `useColorBuffer` (inlined for speed) and `lib/filterEngine.ts` (used for tooltips/presets). Presets live in `lib/filterPresets.ts`.

## Conventions

- Grid indexing: row-major from the north-west corner; longitude is 0–360 in the data (convert with helpers in `lib/gridGeometry.ts`, which handle the >180 → negative wrap). Latitude descends from +90.
- Performance-sensitive code (color buffer, decoders, hover) uses plain loops over typed arrays, not array methods — keep it that way.
- pnpm only (lockfile is `ui/pnpm-lock.yaml`; CI uses pnpm 10 / Node 22).
