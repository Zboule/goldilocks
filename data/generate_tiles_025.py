"""
Generate uint8 land-only binary tiles from period NetCDF files for the web viewer.

Format:
  - Each .bin is a flat Uint8Array of length land_cells (~352K), not the full grid (1M)
  - land_index.bin maps each land cell to its position in the full grid (Uint32Array)
  - Encoding: 0=NaN, 1-255=value mapped to [encode_min, encode_max]
  - Client decodes: value = encode_min + ((uint8 - 1) / 254) * (encode_max - encode_min)

Tile size: ~344 KB raw, ~100 KB gzipped (vs 2 MB raw / 475 KB gzipped before)
Total dataset: ~78 MB gzipped (core stats) vs ~736 MB before

Reads:  data/processed/*_periods.nc
        Land/sea mask from WeatherBench2 Zarr

Writes: data/tiles/{variable}/{stat}/period{NN}.bin  (Uint8, land-only)
        data/tiles/land_index.bin                     (Uint32, grid indices of land cells)
        data/tiles/land_mask.bin                      (Float32, full grid, for legacy compat)
        data/tiles/manifest.json
"""

import xarray as xr
import numpy as np
import json
import time
from pathlib import Path

PROCESSED_DIR = Path("data/processed")
TILES_DIR = Path("data/tiles")
LAND_MASK_PATH = Path("data/raw_025/land_sea_mask.nc")

ZARR_URL = "gs://weatherbench2/datasets/era5/1959-2023_01_10-wb13-6h-1440x721_with_derived_variables.zarr"

VARIABLES = {
    "temperature_day":   {"file": "temperature_day_periods.nc",   "units": "°C",       "label": "Day Temperature"},
    "temperature_night": {"file": "temperature_night_periods.nc", "units": "°C",       "label": "Night Temperature"},
    "wind_speed":        {"file": "wind_speed_periods.nc",        "units": "m/s",      "label": "Wind Speed"},
    "precipitation":     {"file": "precipitation_periods.nc",     "units": "mm/day",   "label": "Precipitation"},
    "rainy_days":        {"file": "rainy_days_periods.nc",        "units": "fraction", "label": "Rainy Days"},
    "sunshine":          {"file": "sunshine_periods.nc",          "units": "fraction", "label": "Sunshine"},
    "cloud_cover":       {"file": "cloud_cover_periods.nc",       "units": "fraction", "label": "Cloud Cover"},
}

STATS = ["mean", "median", "min", "max", "p10", "p90"]

GRID_WIDTH = 1440
GRID_HEIGHT = 721
RESOLUTION_DEG = 0.25


def download_land_mask():
    if LAND_MASK_PATH.exists():
        print(f"  Land mask already exists: {LAND_MASK_PATH}")
        return

    print(f"  Downloading land/sea mask from WeatherBench2 Zarr...")
    ds = xr.open_zarr(ZARR_URL, chunks=None, storage_options={"token": "anon"})

    for name in ["land_sea_mask", "lsm"]:
        if name in ds:
            mask = ds[name]
            break
    else:
        available = [v for v in ds.data_vars if "land" in v.lower() or "mask" in v.lower()]
        if available:
            mask = ds[available[0]]
        else:
            print(f"  WARNING: No land/sea mask found.")
            ds.close()
            return

    if "time" in mask.dims:
        mask = mask.isel(time=0)

    LAND_MASK_PATH.parent.mkdir(parents=True, exist_ok=True)
    mask.load()
    mask.to_netcdf(LAND_MASK_PATH)
    ds.close()
    print(f"  Saved: {LAND_MASK_PATH}")


def load_land_mask() -> np.ndarray:
    """Returns boolean mask (lat=721, lon=1440), True=land."""
    if not LAND_MASK_PATH.exists():
        return None

    mask_raw = xr.open_dataarray(LAND_MASK_PATH)
    mask = mask_raw.values
    if mask.shape == (GRID_WIDTH, GRID_HEIGHT):
        mask = mask.T
    return mask > 0


def encode_uint8(values: np.ndarray, enc_min: float, enc_max: float) -> np.ndarray:
    """Quantize float values to uint8 [1,255]. Input should be land-only (no NaN)."""
    if enc_max == enc_min:
        return np.full(values.shape, 128, dtype=np.uint8)
    normalized = np.clip((values - enc_min) / (enc_max - enc_min), 0.0, 1.0)
    return (normalized * 254 + 1).astype(np.uint8)


def main():
    t0 = time.time()
    print("=" * 60)
    print("  Tile Generator (0.25°, 36 periods, uint8 land-only)")
    print(f"  Grid: {GRID_WIDTH}x{GRID_HEIGHT} ({RESOLUTION_DEG}°)")
    print("=" * 60)

    download_land_mask()
    land_mask = load_land_mask()
    if land_mask is None:
        print("FATAL: No land mask available.")
        return

    print(f"  Land mask: {land_mask.shape}, land={land_mask.sum():,} / {land_mask.size:,}")

    # Build land index: flat indices of land cells in the full (lat, lon) grid
    land_index = np.where(land_mask.ravel())[0].astype(np.uint32)
    n_land = len(land_index)
    print(f"  Land cells: {n_land:,}")

    TILES_DIR.mkdir(parents=True, exist_ok=True)

    # Write land_index.bin (Uint32Array)
    land_index.tofile(TILES_DIR / "land_index.bin")
    print(f"  Saved land_index.bin ({(TILES_DIR / 'land_index.bin').stat().st_size / 1024:.0f} KB)")

    # Write land_mask.bin (Float32, full grid) for legacy compat
    land_mask.astype(np.float32).tofile(TILES_DIR / "land_mask.bin")

    manifest = {
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT, "resolution_deg": RESOLUTION_DEG},
        "lon_range": [0.0, 359.75],
        "lat_range": [90.0, -90.0],
        "periods": [],
        "period_labels": [],
        "stats": STATS,
        "encoding": "uint8-land-only",
        "land_cells": n_land,
        "variables": {},
    }

    total_files = 0

    for var_name, var_cfg in VARIABLES.items():
        nc_path = PROCESSED_DIR / var_cfg["file"]
        print(f"\n  {var_name}: reading {nc_path.name}...")
        ds = xr.open_dataset(nc_path)

        periods = ds.period.values.tolist()
        if not manifest["periods"]:
            manifest["periods"] = periods
            if "period_label" in ds:
                manifest["period_labels"] = ds["period_label"].values.tolist()

        # First pass: find global min/max across all stats and periods (land only)
        var_global_min = float("inf")
        var_global_max = float("-inf")
        mean_values_for_range = []

        for stat in STATS:
            stat_data = ds[stat].values  # (period, lat/lon...)

            for pi in range(len(periods)):
                grid = stat_data[pi].copy()
                if grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T
                land_vals = grid.ravel()[land_index]
                valid = land_vals[~np.isnan(land_vals)]
                if len(valid) > 0:
                    var_global_min = min(var_global_min, float(valid.min()))
                    var_global_max = max(var_global_max, float(valid.max()))
                    if stat == "mean":
                        mean_values_for_range.extend(valid.tolist())

        enc_range = var_global_max - var_global_min
        enc_min = var_global_min - enc_range * 0.01
        enc_max = var_global_max + enc_range * 0.01

        all_means = np.array(mean_values_for_range)
        display_min = float(np.percentile(all_means, 2))
        display_max = float(np.percentile(all_means, 98))

        # Second pass: encode and write land-only uint8 tiles
        for stat in STATS:
            stat_data = ds[stat].values

            for pi, period_num in enumerate(periods):
                grid = stat_data[pi].copy()
                if grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T

                land_vals = grid.ravel()[land_index]
                nan_mask = np.isnan(land_vals)
                encoded = encode_uint8(np.nan_to_num(land_vals, nan=enc_min), enc_min, enc_max)
                encoded[nan_mask] = 0

                out_path = TILES_DIR / var_name / stat / f"period{period_num:02d}.bin"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                encoded.tofile(out_path)
                total_files += 1

        manifest["variables"][var_name] = {
            "units": var_cfg["units"],
            "label": var_cfg["label"],
            "min": round(var_global_min, 2),
            "max": round(var_global_max, 2),
            "display_min": round(display_min, 2),
            "display_max": round(display_max, 2),
            "encode_min": round(enc_min, 4),
            "encode_max": round(enc_max, 4),
        }

        print(f"    {var_name}: {len(STATS) * len(periods)} tiles, "
              f"range=[{var_global_min:.2f}, {var_global_max:.2f}], "
              f"encode=[{enc_min:.2f}, {enc_max:.2f}] {var_cfg['units']}")
        ds.close()

    manifest_path = TILES_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    total_size = sum(f.stat().st_size for f in TILES_DIR.rglob("*.bin"))
    elapsed = time.time() - t0

    print(f"\n{'=' * 60}")
    print(f"  Done in {elapsed:.0f}s")
    print(f"  Total: {total_files} tiles + land_index.bin + manifest.json")
    print(f"  Size:  {total_size / 1e6:.1f} MB ({total_size / total_files / 1024:.0f} KB avg/tile)")
    print(f"  Land cells: {n_land:,} ({n_land * 1 / 1024:.0f} KB per tile)")
    print("=" * 60)


if __name__ == "__main__":
    main()
