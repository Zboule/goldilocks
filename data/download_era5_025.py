"""
Download ERA5 0.25° data from WeatherBench2, one month at a time.

Source: gs://weatherbench2/datasets/era5/1959-2023_01_10-wb13-6h-1440x721_with_derived_variables.zarr

Features:
  - Downloads one month per chunk (~300 MB each)
  - Atomic writes: downloads to .tmp, renames to .nc on success
  - Auto-resume: skips existing valid files
  - Retry with backoff on network errors
  - Progress bar with ETA

Output: data/raw_025/<variable>/<YYYY>-<MM>.nc
"""

import xarray as xr
import numpy as np
import os
import sys
import time
import warnings
import calendar
from pathlib import Path

warnings.filterwarnings("ignore")

ZARR_URL = "gs://weatherbench2/datasets/era5/1959-2023_01_10-wb13-6h-1440x721_with_derived_variables.zarr"
RAW_DIR = Path("data/raw_025")

START_YEAR = 2013
END_YEAR = 2023
END_MONTH = 1  # Jan 2023 (inclusive, to match the dataset end)

VARIABLES = [
    "2m_temperature",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "total_precipitation_6hr",
    "total_cloud_cover",
]

MAX_RETRIES = 3
RETRY_BACKOFF = [30, 60, 120]


def generate_months():
    """Generate (year, month) tuples for the download range."""
    months = []
    for year in range(START_YEAR, END_YEAR + 1):
        end_m = END_MONTH if year == END_YEAR else 12
        for month in range(1, end_m + 1):
            months.append((year, month))
    return months


def expected_timesteps(year: int, month: int) -> int:
    """Expected number of 6-hourly timesteps in a month."""
    days = calendar.monthrange(year, month)[1]
    return days * 4


def is_valid_chunk(path: Path, year: int, month: int) -> bool:
    """Check if an existing chunk file is complete."""
    if not path.exists():
        return False
    try:
        ds = xr.open_dataset(path)
        n = ds.sizes.get("time", 0)
        ds.close()
        expected = expected_timesteps(year, month)
        if year == END_YEAR and month == END_MONTH:
            return n >= 4  # partial last month is OK
        return n == expected
    except Exception:
        return False


def download_chunk(ds: xr.Dataset, var_name: str, year: int, month: int, out_dir: Path) -> bool:
    """Download one month of one variable. Returns True on success."""
    out_file = out_dir / f"{year}-{month:02d}.nc"
    tmp_file = out_dir / f"{year}-{month:02d}.tmp"

    if is_valid_chunk(out_file, year, month):
        return True

    # Clean up any partial downloads
    if tmp_file.exists():
        tmp_file.unlink()

    last_day = calendar.monthrange(year, month)[1]
    t_start = f"{year}-{month:02d}-01"
    t_end = f"{year}-{month:02d}-{last_day}"

    for attempt in range(MAX_RETRIES):
        try:
            chunk = ds[var_name].sel(time=slice(t_start, t_end))
            data = chunk.compute()
            data.to_netcdf(tmp_file)
            tmp_file.rename(out_file)
            return True
        except Exception as e:
            if tmp_file.exists():
                tmp_file.unlink()
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF[attempt]
                print(f"\n    Retry {attempt + 1}/{MAX_RETRIES} after error: {e}")
                print(f"    Waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                print(f"\n    FAILED after {MAX_RETRIES} attempts: {e}")
                return False
    return False


def format_bytes(b: float) -> str:
    if b >= 1e9:
        return f"{b / 1e9:.1f} GB"
    return f"{b / 1e6:.0f} MB"


def format_time(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.0f}s"
    if seconds < 3600:
        return f"{seconds / 60:.0f}m"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    return f"{h}h {m:02d}m"


def main():
    print("=" * 70)
    print("  ERA5 0.25° Downloader (WeatherBench2, month-by-month)")
    print(f"  Source: {ZARR_URL}")
    print(f"  Period: {START_YEAR}-01 to {END_YEAR}-{END_MONTH:02d}")
    print(f"  Variables: {VARIABLES}")
    print(f"  Output: {RAW_DIR.resolve()}")
    print("=" * 70)

    months = generate_months()
    total_chunks = len(VARIABLES) * len(months)

    # Count already done
    done_count = 0
    for var in VARIABLES:
        var_dir = RAW_DIR / var
        for year, month in months:
            if is_valid_chunk(var_dir / f"{year}-{month:02d}.nc", year, month):
                done_count += 1

    print(f"\n  Total chunks: {total_chunks} ({len(VARIABLES)} vars × {len(months)} months)")
    print(f"  Already done: {done_count}")
    print(f"  Remaining:    {total_chunks - done_count}")

    if done_count == total_chunks:
        print("\n  All downloads complete!")
        return

    print(f"\n  Opening Zarr (metadata only)...", flush=True)
    ds = xr.open_zarr(
        ZARR_URL,
        chunks={"time": 124},
        storage_options={"token": "anon"},
    )
    print(f"  OK. Grid: {ds.sizes['longitude']}×{ds.sizes['latitude']}")

    completed = done_count
    failed = []
    start_time = time.time()
    chunk_times = []

    for vi, var_name in enumerate(VARIABLES):
        var_dir = RAW_DIR / var_name
        var_dir.mkdir(parents=True, exist_ok=True)

        for mi, (year, month) in enumerate(months):
            chunk_id = f"{var_name}/{year}-{month:02d}"
            out_file = var_dir / f"{year}-{month:02d}.nc"

            if is_valid_chunk(out_file, year, month):
                continue

            chunk_start = time.time()

            # Progress bar
            pct = 100 * completed / total_chunks
            elapsed = time.time() - start_time
            if chunk_times:
                avg_chunk = sum(chunk_times) / len(chunk_times)
                remaining = (total_chunks - completed) * avg_chunk
                eta = format_time(remaining)
            else:
                eta = "calculating..."

            done_bytes = sum(
                f.stat().st_size
                for var in VARIABLES
                for f in (RAW_DIR / var).glob("*.nc")
                if f.exists()
            )

            bar_width = 30
            filled = int(bar_width * completed / total_chunks)
            bar = "=" * filled + ">" + " " * (bar_width - filled - 1)
            print(
                f"\r  [{bar}] {completed}/{total_chunks} ({pct:.0f}%) "
                f"— {chunk_id} — {format_bytes(done_bytes)} — ETA: {eta}   ",
                end="",
                flush=True,
            )

            success = download_chunk(ds, var_name, year, month, var_dir)

            chunk_elapsed = time.time() - chunk_start

            if success:
                completed += 1
                chunk_times.append(chunk_elapsed)
                # Keep only last 10 for moving average
                if len(chunk_times) > 10:
                    chunk_times = chunk_times[-10:]
                size = out_file.stat().st_size
                print(
                    f"\r  [{bar}] {completed}/{total_chunks} ({100*completed/total_chunks:.0f}%) "
                    f"— {chunk_id} ✓ {format_bytes(size)} in {format_time(chunk_elapsed)}   ",
                    flush=True,
                )
            else:
                failed.append(chunk_id)

        # Variable summary
        var_files = list(var_dir.glob("*.nc"))
        var_size = sum(f.stat().st_size for f in var_files)
        print(f"\n  {var_name}: {len(var_files)}/{len(months)} months, {format_bytes(var_size)}")

    ds.close()

    total_elapsed = time.time() - start_time
    total_size = sum(
        f.stat().st_size
        for var in VARIABLES
        for f in (RAW_DIR / var).glob("*.nc")
        if f.exists()
    )

    print(f"\n{'=' * 70}")
    print(f"  Done in {format_time(total_elapsed)}")
    print(f"  Downloaded: {completed}/{total_chunks} chunks, {format_bytes(total_size)}")
    if failed:
        print(f"  Failed: {len(failed)} chunks:")
        for f in failed:
            print(f"    - {f}")
    print("=" * 70)


if __name__ == "__main__":
    main()
