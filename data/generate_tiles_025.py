"""
Generate uint16 quantized binary tiles from period NetCDF files for the web viewer.

Encoding: each value is mapped to uint16 [1, 65535] using per-variable min/max.
  - 0 = NaN sentinel (ocean / no-data)
  - Client decodes: value = encode_min + ((uint16 - 1) / 65534) * (encode_max - encode_min)

Reads:  data/processed/*_periods.nc  (36 periods × lat × lon, 6 stats)
        Land/sea mask downloaded from WeatherBench2 Zarr on first run

Writes: data/tiles/{variable}/{stat}/period{NN}.bin  (721×1440 Uint16, ocean=0)
        data/tiles/manifest.json
        data/tiles/land_mask.bin  (721×1440 Float32, kept as float for client compat)

Tile size: ~2 MB raw (vs 4 MB float32), ~300-500 KB gzipped.
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
    ds = xr.open_zarr(
        ZARR_URL,
        chunks=None,
        storage_options={"token": "anon"},
    )

    if "land_sea_mask" in ds:
        mask = ds["land_sea_mask"]
    elif "lsm" in ds:
        mask = ds["lsm"]
    else:
        available = [v for v in ds.data_vars if "land" in v.lower() or "mask" in v.lower() or "lsm" in v.lower()]
        if available:
            mask = ds[available[0]]
            print(f"  Using variable: {available[0]}")
        else:
            print(f"  WARNING: No land/sea mask found. Available vars: {list(ds.data_vars)[:20]}")
            ds.close()
            return

    if "time" in mask.dims:
        mask = mask.isel(time=0)

    LAND_MASK_PATH.parent.mkdir(parents=True, exist_ok=True)
    mask.load()
    mask.to_netcdf(LAND_MASK_PATH)
    ds.close()
    print(f"  Saved land mask: {LAND_MASK_PATH} ({LAND_MASK_PATH.stat().st_size / 1e6:.1f} MB)")


def load_land_mask() -> np.ndarray:
    """Load land/sea mask as (lat=721, lon=1440) boolean array."""
    if not LAND_MASK_PATH.exists():
        print("  No land mask available — skipping ocean masking.")
        return None

    mask_raw = xr.open_dataarray(LAND_MASK_PATH)
    mask = mask_raw.values

    if mask.shape == (GRID_WIDTH, GRID_HEIGHT):
        # Shape is (lon, lat) — transpose to (lat, lon)
        mask = mask.T
    elif mask.shape == (GRID_HEIGHT, GRID_WIDTH):
        pass  # Already (lat, lon)
    else:
        # Try to figure it out from dims
        dims = list(mask_raw.dims)
        if len(dims) == 2 and dims[0] in ("longitude", "lon"):
            mask = mask.T

    print(f"  Land mask loaded: {mask.shape} (expect {GRID_HEIGHT}×{GRID_WIDTH})")
    return mask >= 0.5


def encode_uint16(grid: np.ndarray, enc_min: float, enc_max: float) -> np.ndarray:
    """Quantize float grid to uint16. NaN → 0, valid → [1, 65535]."""
    out = np.zeros(grid.shape, dtype=np.uint16)
    valid = ~np.isnan(grid)
    if enc_max == enc_min:
        out[valid] = 32768
    else:
        normalized = (grid[valid] - enc_min) / (enc_max - enc_min)
        normalized = np.clip(normalized, 0.0, 1.0)
        out[valid] = (normalized * 65534 + 1).astype(np.uint16)
    return out


def write_bin(data_2d: np.ndarray, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    data_2d.tofile(path)


def main():
    t0 = time.time()
    print("=" * 60)
    print("  Binary Tile Generator (0.25°, 36 periods, uint16)")
    print(f"  Input:  {PROCESSED_DIR}")
    print(f"  Output: {TILES_DIR}")
    print(f"  Grid:   {GRID_WIDTH}×{GRID_HEIGHT} ({RESOLUTION_DEG}°)")
    print(f"  Encoding: uint16 (0=NaN, 1-65535=value range)")
    print("=" * 60)

    download_land_mask()
    land_mask = load_land_mask()

    TILES_DIR.mkdir(parents=True, exist_ok=True)

    if land_mask is not None:
        print(f"\nLand mask: {land_mask.shape}, land cells: {land_mask.sum()}/{land_mask.size}")
        mask_float = land_mask.astype(np.float32)
        write_bin(mask_float, TILES_DIR / "land_mask.bin")
        print(f"Saved land_mask.bin ({(TILES_DIR / 'land_mask.bin').stat().st_size / 1024:.0f} KB)")
    else:
        print("\nNo land mask — all cells will have values.")

    manifest = {
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT, "resolution_deg": RESOLUTION_DEG},
        "lon_range": [0.0, 359.75],
        "lat_range": [-90.0, 90.0],
        "periods": [],
        "period_labels": [],
        "stats": STATS,
        "encoding": "uint16",
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

        # First pass: find global min/max across all stats and periods
        var_global_min = float("inf")
        var_global_max = float("-inf")
        mean_values_for_range: list[float] = []

        for stat in STATS:
            stat_data = ds[stat].values

            for pi in range(len(periods)):
                grid = stat_data[pi].copy()
                if grid.ndim == 2 and grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T
                if land_mask is not None:
                    grid[~land_mask] = np.nan

                valid = grid[~np.isnan(grid)]
                if len(valid) > 0:
                    var_global_min = min(var_global_min, float(valid.min()))
                    var_global_max = max(var_global_max, float(valid.max()))
                    if stat == "mean":
                        mean_values_for_range.extend(valid.tolist())

        # Add 1% padding to encoding range to avoid clipping edge values
        enc_range = var_global_max - var_global_min
        enc_min = var_global_min - enc_range * 0.01
        enc_max = var_global_max + enc_range * 0.01

        all_means = np.array(mean_values_for_range)
        display_min = float(np.percentile(all_means, 2))
        display_max = float(np.percentile(all_means, 98))

        # Second pass: encode and write tiles
        for stat in STATS:
            stat_data = ds[stat].values

            for pi, period_num in enumerate(periods):
                grid = stat_data[pi].copy()
                if grid.ndim == 2 and grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T
                if land_mask is not None:
                    grid[~land_mask] = np.nan

                encoded = encode_uint16(grid, enc_min, enc_max)
                out_path = TILES_DIR / var_name / stat / f"period{period_num:02d}.bin"
                write_bin(encoded, out_path)
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

        print(f"    {var_name}: {len(STATS) * len(periods)} tiles, range=[{var_global_min:.2f}, {var_global_max:.2f}], encode=[{enc_min:.2f}, {enc_max:.2f}] {var_cfg['units']}")
        ds.close()

    manifest_path = TILES_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nSaved manifest.json")

    total_size = sum(f.stat().st_size for f in TILES_DIR.rglob("*.bin"))
    elapsed = time.time() - t0

    print(f"\n{'=' * 60}")
    print(f"  Done in {elapsed:.0f}s")
    print(f"  Total: {total_files} .bin files + manifest.json + land_mask.bin")
    print(f"  Size:  {total_size / 1e6:.1f} MB ({total_size / total_files / 1024:.0f} KB avg per tile)")
    print("=" * 60)


if __name__ == "__main__":
    main()
