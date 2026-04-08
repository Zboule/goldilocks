"""
Download raw ERA5 data from WeatherBench2 (Google Cloud Storage).

Source: WeatherBench2 ERA5 1.5° 6-hourly
  gs://weatherbench2/datasets/era5/1959-2023_01_10-6h-240x121_equiangular_with_poles_conservative.zarr

Downloads selected surface variables for a given time range and saves them
as-is (no transformations) to data/raw/<variable>.nc.

Transformations (daily stats, weekly aggregation, etc.) are done separately
in a processing step that reads from data/raw/ and writes to data/processed/.
"""

import xarray as xr
import os
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ZARR_URL = "gs://weatherbench2/datasets/era5/1959-2023_01_10-6h-240x121_equiangular_with_poles_conservative.zarr"

RAW_DIR = Path("data/raw")

START_DATE = "2013-01-01"
END_DATE = "2023-01-10"

VARIABLES = [
    "2m_temperature",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "total_precipitation_6hr",
    "mean_surface_net_short_wave_radiation_flux",
]


def main():
    print("=" * 70)
    print("ERA5 Raw Data Downloader (WeatherBench2 1.5° 6-hourly)")
    print(f"  Source:    {ZARR_URL}")
    print(f"  Period:    {START_DATE} to {END_DATE}")
    print(f"  Variables: {VARIABLES}")
    print(f"  Output:    {RAW_DIR.resolve()}")
    print("=" * 70)

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("\nOpening remote Zarr (lazy, metadata only)...")
    ds = xr.open_zarr(
        ZARR_URL,
        chunks={"time": 1460},
        storage_options={"token": "anon"},
    )
    print(f"  Grid: {ds.sizes['longitude']}x{ds.sizes['latitude']} ({ds.sizes['longitude'] * 1.5}° lon x {ds.sizes['latitude'] * 1.5 - 1.5}° lat)")
    print(f"  Available: {str(ds.time.values[0])[:10]} to {str(ds.time.values[-1])[:10]}")

    ds_slice = ds.sel(time=slice(START_DATE, END_DATE))
    n_times = ds_slice.sizes["time"]
    print(f"  Selected: {n_times} timesteps ({START_DATE} to {END_DATE})")

    for i, var_name in enumerate(VARIABLES):
        out_file = RAW_DIR / f"{var_name}.nc"

        if out_file.exists():
            existing = xr.open_dataset(out_file)
            if existing.sizes.get("time", 0) == n_times:
                size_mb = out_file.stat().st_size / (1024 * 1024)
                print(f"\n[{i+1}/{len(VARIABLES)}] {var_name}: already downloaded ({size_mb:.0f} MB), skipping.")
                existing.close()
                continue
            existing.close()

        print(f"\n[{i+1}/{len(VARIABLES)}] {var_name}: downloading...")
        t0 = time.time()

        var_data = ds_slice[var_name]
        expected_mb = var_data.size * 4 / (1024 * 1024)
        print(f"  Shape: {dict(var_data.sizes)}")
        print(f"  Expected size: ~{expected_mb:.0f} MB")

        print(f"  Fetching from GCS...", end="", flush=True)
        var_data = var_data.compute()
        elapsed_fetch = time.time() - t0
        print(f" done ({elapsed_fetch:.0f}s)")

        print(f"  Saving to {out_file}...", end="", flush=True)
        var_data.to_netcdf(out_file)
        elapsed_total = time.time() - t0
        size_mb = out_file.stat().st_size / (1024 * 1024)
        print(f" done ({size_mb:.0f} MB, {elapsed_total:.0f}s total)")

    ds.close()

    print(f"\n{'=' * 70}")
    print("Raw download complete. Files in data/raw/:")
    total_mb = 0
    for f in sorted(RAW_DIR.glob("*.nc")):
        sz = f.stat().st_size / (1024 * 1024)
        total_mb += sz
        print(f"  {f.name:60s} {sz:8.1f} MB")
    print(f"  {'TOTAL':60s} {total_mb:8.1f} MB")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
