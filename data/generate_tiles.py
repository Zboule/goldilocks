"""
Generate binary tiles from weekly NetCDF files for the web viewer.

Reads:  data/processed/*_weekly.nc  (53 weeks × 240 lon × 121 lat, 6 stats)
        data/raw/land_sea_mask.nc

Writes: data/tiles/{variable}/{stat}/week{NN}.bin   (121×240 Float32, ocean=NaN)
        data/tiles/manifest.json                     (metadata for the client)
        data/tiles/land_mask.bin                      (121×240 Float32)

Each .bin is a raw Float32Array in row-major order: (latitude=121, longitude=240).
  - lat_idx=0 is -90° (south pole), lat_idx=120 is +90° (north pole)
  - lon_idx=0 is 0°, lon_idx=239 is 358.5°
  - index = lat_idx * 240 + lon_idx
"""

import xarray as xr
import numpy as np
import json
import time
from pathlib import Path

PROCESSED_DIR = Path("data/processed")
RAW_DIR = Path("data/raw")
TILES_DIR = Path("data/tiles")

VARIABLES = {
    "temperature_day":   {"file": "temperature_day_weekly.nc",   "units": "°C",       "label": "Day Temperature"},
    "temperature_night": {"file": "temperature_night_weekly.nc", "units": "°C",       "label": "Night Temperature"},
    "wind_speed":        {"file": "wind_speed_weekly.nc",        "units": "m/s",      "label": "Wind Speed"},
    "precipitation":     {"file": "precipitation_weekly.nc",     "units": "mm/day",   "label": "Precipitation"},
    "rainy_days":        {"file": "rainy_days_weekly.nc",       "units": "fraction", "label": "Rainy Days"},
    "sunshine":          {"file": "sunshine_weekly.nc",          "units": "fraction", "label": "Sunshine"},
    "cloud_cover":       {"file": "cloud_cover_weekly.nc",       "units": "fraction", "label": "Cloud Cover"},
}

STATS = ["mean", "median", "min", "max", "p10", "p90"]


def load_land_mask() -> np.ndarray:
    """Load land/sea mask and transpose to (lat, lon). Returns boolean mask (True=land)."""
    mask_raw = xr.open_dataarray(RAW_DIR / "land_sea_mask.nc")
    # Raw shape is (longitude=240, latitude=121), transpose to (lat=121, lon=240)
    mask = mask_raw.values.T
    return mask >= 0.5


def write_bin(data_2d: np.ndarray, path: Path):
    """Write a 2D float32 array as raw bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data_2d.astype(np.float32).tofile(path)


def main():
    t0 = time.time()
    print("=" * 60)
    print("  Binary Tile Generator")
    print(f"  Input:  {PROCESSED_DIR}")
    print(f"  Output: {TILES_DIR}")
    print("=" * 60)

    land_mask = load_land_mask()  # (121, 240), True=land
    print(f"\nLand mask: {land_mask.shape}, land cells: {land_mask.sum()}/{land_mask.size}")

    # Save land mask as a binary tile too
    TILES_DIR.mkdir(parents=True, exist_ok=True)
    mask_float = land_mask.astype(np.float32)
    write_bin(mask_float, TILES_DIR / "land_mask.bin")
    print(f"Saved land_mask.bin ({(TILES_DIR / 'land_mask.bin').stat().st_size / 1024:.0f} KB)")

    manifest = {
        "grid": {"width": 240, "height": 121, "resolution_deg": 1.5},
        "lon_range": [0.0, 358.5],
        "lat_range": [-90.0, 90.0],
        "weeks": [],
        "stats": STATS,
        "variables": {},
    }

    total_files = 0

    for var_name, var_cfg in VARIABLES.items():
        nc_path = PROCESSED_DIR / var_cfg["file"]
        print(f"\n  {var_name}: reading {nc_path.name}...")
        ds = xr.open_dataset(nc_path)

        weeks = ds.week.values.tolist()
        if not manifest["weeks"]:
            manifest["weeks"] = weeks

        var_global_min = float("inf")
        var_global_max = float("-inf")
        mean_values_for_range: list[float] = []

        for stat in STATS:
            stat_data = ds[stat].values  # (week=53, lon=240, lat=121)

            for wi, week_num in enumerate(weeks):
                grid = stat_data[wi].T  # (121, 240)
                grid[~land_mask] = np.nan

                valid = grid[~np.isnan(grid)]
                if len(valid) > 0:
                    var_global_min = min(var_global_min, float(valid.min()))
                    var_global_max = max(var_global_max, float(valid.max()))
                    if stat == "mean":
                        mean_values_for_range.extend(valid.tolist())

                out_path = TILES_DIR / var_name / stat / f"week{week_num:02d}.bin"
                write_bin(grid, out_path)
                total_files += 1

        all_means = np.array(mean_values_for_range)
        display_min = float(np.percentile(all_means, 2))
        display_max = float(np.percentile(all_means, 98))

        manifest["variables"][var_name] = {
            "units": var_cfg["units"],
            "label": var_cfg["label"],
            "min": round(var_global_min, 2),
            "max": round(var_global_max, 2),
            "display_min": round(display_min, 2),
            "display_max": round(display_max, 2),
        }

        print(f"    {var_name}: {len(STATS) * len(weeks)} tiles, range=[{var_global_min:.2f}, {var_global_max:.2f}], display=[{display_min:.2f}, {display_max:.2f}] {var_cfg['units']}")
        ds.close()

    manifest_path = TILES_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nSaved manifest.json")

    total_size = sum(f.stat().st_size for f in TILES_DIR.rglob("*.bin"))
    elapsed = time.time() - t0

    print(f"\n{'=' * 60}")
    print(f"  Done in {elapsed:.0f}s")
    print(f"  Total: {total_files} .bin files + manifest.json")
    print(f"  Size:  {total_size / 1e6:.1f} MB ({total_size / total_files / 1024:.0f} KB avg per tile)")
    print("=" * 60)


if __name__ == "__main__":
    main()
