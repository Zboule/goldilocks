"""
Download ERA5 hourly total precipitation and compute daily rainy-hour fractions.

Source: reanalysis-era5-single-levels (CDS)
  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels

Strategy:
  Phase 1: Submit all 10 year requests at once (CDS prepares in parallel)
  Phase 2: As each year completes, download, compute daily fractions, save results

For each day, computes 3 metrics (fraction of hours with precip > 0.1mm):
  - rainy_fraction:       all 24 hours
  - rainy_fraction_day:   local solar hours 7-19 (daytime, 12h)
  - rainy_fraction_night: local solar hours 19-7 (nighttime, 12h)

Local solar time = (UTC_hour + lon / 15) % 24 — no timezone database needed.

Output: data/raw_025/rainy_hours/{YYYY}-{MM}.nc  (3 variables, daily time dim)

Prerequisites:
  pip install cdsapi xarray netcdf4
  ~/.cdsapirc with CDS Personal Access Token
"""

import json
import time
import sys
import zipfile
import os
import glob as globmod
from pathlib import Path

import numpy as np
import xarray as xr

RAW_DIR = Path("data/raw_025/rainy_hours")
STATE_FILE = RAW_DIR / ".jobs.json"

START_YEAR = 2013
END_YEAR = 2022
YEARS = list(range(START_YEAR, END_YEAR + 1))

DATASET = "reanalysis-era5-single-levels"
RAIN_THRESHOLD_MM = 0.1
POLL_INTERVAL = 30


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def year_complete(year: int) -> bool:
    for month in range(1, 13):
        if not (RAW_DIR / f"{year}-{month:02d}.nc").exists():
            return False
    return True


def make_client():
    os.environ.setdefault("ECMWF_DATASTORES_URL", "https://cds.climate.copernicus.eu/api")
    rc = Path.home() / ".cdsapirc"
    if rc.exists():
        for line in rc.read_text().splitlines():
            if line.startswith("key:"):
                os.environ.setdefault("ECMWF_DATASTORES_KEY", line.split(":", 1)[1].strip())
    from ecmwf.datastores.client import Client
    return Client(cleanup=False)


def make_request(year: int) -> dict:
    return {
        "product_type": ["reanalysis"],
        "variable": ["total_precipitation"],
        "year": [str(year)],
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "time": [f"{h:02d}:00" for h in range(24)],
        "data_format": "netcdf",
        "download_format": "unarchived",
    }


def get_job_status(client, job_id: str) -> dict | None:
    try:
        jobs = client.get_jobs(limit=50, sortby="-created",
                               status=["accepted", "running", "successful", "failed"])
        for j in jobs.json["jobs"]:
            if j["jobID"] == job_id:
                result = {"status": j["status"]}
                expired = j.get("metadata", {}).get("results", {}).get("type", "")
                if "expired" in expired:
                    result["status"] = "expired"
                return result
    except Exception as e:
        print(f"    Warning: could not check job {job_id}: {e}", flush=True)
    return None


def submit_job(client, year: int) -> str | None:
    try:
        remote = client.submit(DATASET, make_request(year))
        job_id = remote.request_id
        print(f"    Submitted job {job_id}", flush=True)
        return job_id
    except Exception as e:
        print(f"    ERROR submitting {year}: {e}", flush=True)
        return None


def build_daytime_mask(lons: np.ndarray) -> np.ndarray:
    """Precompute boolean mask (24, n_lon) where True = daytime (local solar hour 7-19)."""
    utc_hours = np.arange(24)
    lon_offsets = lons / 15.0
    local_hours = (utc_hours[:, None] + lon_offsets[None, :]) % 24
    return (local_hours >= 7) & (local_hours < 19)


def process_year(client, year: int, job_id: str) -> bool:
    """Download a completed year, compute daily rainy fractions month-by-month.

    Processes one month at a time to keep memory under ~3 GB (vs 36 GB for full year).
    Uses xarray lazy loading + isel to avoid loading the entire file."""
    tmp_file = RAW_DIR / f"{year}.tmp.nc"
    try:
        print(f"    Downloading {year}...", flush=True)
        client.download_results(job_id, str(tmp_file))
        print(f"    Downloaded ({tmp_file.stat().st_size / 1e9:.1f} GB). Processing month-by-month...", flush=True)

        ds = xr.open_dataset(tmp_file)
        tp_var = "tp" if "tp" in ds else list(ds.data_vars)[0]
        time_dim = "valid_time" if "valid_time" in ds.dims else "time"
        lat_dim = "latitude" if "latitude" in ds.dims else "lat"
        lon_dim = "longitude" if "longitude" in ds.dims else "lon"

        lons = ds[lon_dim].values
        lats = ds[lat_dim].values
        all_times = ds[time_dim].values

        lat_slice = slice(0, 601) if len(lats) > 601 else slice(None)
        lats = lats[:601] if len(lats) > 601 else lats

        daytime_mask = build_daytime_mask(lons)  # (24, n_lon)
        dm = daytime_mask[None, :, None, :]  # (1, 24, 1, n_lon)
        nm = ~daytime_mask[None, :, None, :]
        dm_sum = dm.sum(axis=1)  # (1, 1, n_lon)
        nm_sum = nm.sum(axis=1)

        for month in range(1, 13):
            out_path = RAW_DIR / f"{year}-{month:02d}.nc"
            if out_path.exists():
                print(f"      {year}-{month:02d}: already exists, skipping", flush=True)
                continue

            month_mask = (all_times.astype("datetime64[M]").astype(int) % 12 + 1) == month
            month_indices = np.where(month_mask)[0]
            if len(month_indices) == 0:
                continue

            # Load only this month's data into memory
            chunk = ds[tp_var].isel(
                **{time_dim: month_indices, lat_dim: lat_slice}
            ).values * 1000.0  # m -> mm

            is_raining = chunk > RAIN_THRESHOLD_MM  # (hours, lat, lon) bool
            del chunk

            m_hours = is_raining.shape[0]
            m_days = m_hours // 24
            if m_days == 0:
                del is_raining
                continue

            reshaped = is_raining[:m_days * 24].reshape(m_days, 24, len(lats), len(lons))
            del is_raining

            all_frac = reshaped.mean(axis=1).astype(np.float32)
            day_frac = (reshaped * dm).sum(axis=1) / dm_sum
            night_frac = (reshaped * nm).sum(axis=1) / nm_sum
            del reshaped

            day_times = all_times[month_indices[:m_days * 24:24]]

            out_ds = xr.Dataset(
                {
                    "rainy_fraction": (["time", "latitude", "longitude"], all_frac.astype(np.float32)),
                    "rainy_fraction_day": (["time", "latitude", "longitude"], day_frac.astype(np.float32)),
                    "rainy_fraction_night": (["time", "latitude", "longitude"], night_frac.astype(np.float32)),
                },
                coords={"time": day_times, "latitude": lats, "longitude": lons},
            )
            out_ds.to_netcdf(out_path)
            print(f"      {year}-{month:02d}: {m_days} days", flush=True)
            out_ds.close()
            del all_frac, day_frac, night_frac

        ds.close()
        if tmp_file.exists():
            tmp_file.unlink()
        print(f"    {year} complete.", flush=True)
        return True

    except Exception as e:
        print(f"    ERROR processing {year}: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False


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
    print("  ERA5 Hourly Precipitation → Daily Rainy-Hour Fractions")
    print(f"  Dataset: {DATASET}")
    print(f"  Period: {START_YEAR}–{END_YEAR} (10 years)")
    print(f"  Threshold: > {RAIN_THRESHOLD_MM} mm/h")
    print(f"  Outputs: rainy_fraction, rainy_fraction_day (7-19), rainy_fraction_night (19-7)")
    print(f"  Output dir: {RAW_DIR.resolve()}")
    print("=" * 70)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    state = load_state()
    client = make_client()
    start_time = time.time()

    # Phase 1: classify each year
    complete = []
    needs_download = []
    needs_poll = []
    needs_submit = []

    for year in YEARS:
        y = str(year)
        if year_complete(year):
            complete.append(year)
            continue
        job_id = state.get(y)
        if job_id:
            info = get_job_status(client, job_id)
            if info and info["status"] == "successful":
                needs_download.append((year, job_id))
            elif info and info["status"] in ("running", "accepted"):
                needs_poll.append((year, job_id))
            else:
                needs_submit.append(year)
        else:
            needs_submit.append(year)

    print(f"\n  Status:")
    print(f"    Complete on disk: {len(complete)} — {complete}")
    print(f"    Ready to download: {len(needs_download)} — {[y for y, _ in needs_download]}")
    print(f"    Still processing: {len(needs_poll)} — {[y for y, _ in needs_poll]}")
    print(f"    Need submission: {len(needs_submit)} — {needs_submit}")

    # Phase 2: submit new jobs
    for year in needs_submit:
        print(f"\n  Submitting {year}...", flush=True)
        job_id = submit_job(client, year)
        if job_id:
            state[str(year)] = job_id
            needs_poll.append((year, job_id))
            save_state(state)

    # Phase 3: download already-successful jobs
    for year, job_id in needs_download:
        print(f"\n  Processing {year} (already ready)...", flush=True)
        if process_year(client, year, job_id):
            complete.append(year)

    # Phase 4: poll remaining jobs, download & process as they complete
    while needs_poll:
        pending_years = [y for y, _ in needs_poll]
        elapsed = format_time(time.time() - start_time)
        print(f"\n  [{elapsed}] Waiting for {len(needs_poll)} jobs: {pending_years}", flush=True)
        print(f"    Polling in {POLL_INTERVAL}s...", flush=True)
        time.sleep(POLL_INTERVAL)

        still_waiting = []
        for year, job_id in needs_poll:
            info = get_job_status(client, job_id)
            if not info:
                print(f"    {year}: job not found, resubmitting...", flush=True)
                new_id = submit_job(client, year)
                if new_id:
                    state[str(year)] = new_id
                    still_waiting.append((year, new_id))
                    save_state(state)
                continue

            if info["status"] == "successful":
                print(f"  {year}: ready! Downloading & processing...", flush=True)
                if process_year(client, year, job_id):
                    complete.append(year)
                else:
                    still_waiting.append((year, job_id))
            elif info["status"] == "failed":
                print(f"    {year}: FAILED, resubmitting...", flush=True)
                new_id = submit_job(client, year)
                if new_id:
                    state[str(year)] = new_id
                    still_waiting.append((year, new_id))
                    save_state(state)
            else:
                still_waiting.append((year, job_id))

        needs_poll = still_waiting

    # Summary
    total_elapsed = time.time() - start_time
    total_size = sum(f.stat().st_size for f in RAW_DIR.glob("*.nc"))
    missing = [y for y in YEARS if not year_complete(y)]

    print(f"\n{'=' * 70}")
    print(f"  Done in {format_time(total_elapsed)}")
    print(f"  Total on disk: {total_size / 1e9:.2f} GB")
    if missing:
        print(f"  MISSING years: {missing}")
    else:
        print(f"  All {len(YEARS)} years complete!")
    print("=" * 70)


if __name__ == "__main__":
    main()
