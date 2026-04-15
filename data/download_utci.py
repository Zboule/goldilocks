"""
Download ERA5-HEAT UTCI daily statistics from Copernicus Climate Data Store.

Source: derived-utci-historical (ERA5-HEAT v1.1)
  https://cds.climate.copernicus.eu/datasets/derived-utci-historical

Resilient design:
  - Tracks job IDs in a local state file (.jobs.json)
  - On restart, reattaches to existing CDS jobs instead of creating duplicates
  - Only submits new requests for years with no active/successful job
  - Run inside tmux for SSH disconnect resilience

Grid: 601 lat (90N-60S) x 1440 lon.
Period: 2013-2022 (10 full years).

Output: data/raw_025/utci_daily/{YYYY}-{MM}.nc
"""

import json
import time
import sys
import zipfile
from pathlib import Path

import requests as http_requests
import xarray as xr

RAW_DIR = Path("data/raw_025/utci_daily")
STATE_FILE = RAW_DIR / ".jobs.json"

START_YEAR = 2013
END_YEAR = 2022
YEARS = list(range(START_YEAR, END_YEAR + 1))

DATASET = "derived-utci-historical"
POLL_INTERVAL = 30


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def year_complete(year: int) -> bool:
    for month in range(1, 13):
        path = RAW_DIR / f"{year}-{month:02d}.nc"
        if not path.exists():
            return False
    return True


def make_client():
    import os
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
        "variable": ["universal_thermal_climate_index_daily_statistics"],
        "version": "1_1",
        "product_type": "consolidated_dataset",
        "year": [str(year)],
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],
    }


def get_job_status(client, job_id: str) -> dict | None:
    """Check a job's status via the API. Returns {status, href} or None if gone."""
    try:
        jobs = client.get_jobs(limit=50, sortby="-created",
                               status=["accepted", "running", "successful", "failed"])
        for j in jobs.json["jobs"]:
            if j["jobID"] == job_id:
                result = {"status": j["status"]}
                if j["status"] == "successful":
                    asset = j.get("metadata", {}).get("results", {}).get("asset", {}).get("value", {})
                    result["href"] = asset.get("href", "")
                    expired = j.get("metadata", {}).get("results", {}).get("type", "")
                    if "expired" in expired:
                        result["status"] = "expired"
                return result
    except Exception as e:
        print(f"    Warning: could not check job {job_id}: {e}", flush=True)
    return None


def download_zip(url: str, target: Path):
    """Download a file from URL with progress."""
    resp = http_requests.get(url, stream=True, timeout=600)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    downloaded = 0
    with open(target, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
            f.write(chunk)
            downloaded += len(chunk)
            if total:
                pct = 100 * downloaded / total
                print(f"\r    Downloading: {downloaded / 1e9:.2f}/{total / 1e9:.2f} GB ({pct:.0f}%)",
                      end="", flush=True)
    print(flush=True)


def extract_and_split(zip_path: Path, year: int) -> bool:
    """Extract zip, merge daily NCs, split into per-month files."""
    extract_dir = RAW_DIR / f"{year}_extract"
    extract_dir.mkdir(exist_ok=True)

    try:
        if zipfile.is_zipfile(str(zip_path)):
            with zipfile.ZipFile(str(zip_path)) as zf:
                zf.extractall(extract_dir)
            nc_files = sorted(extract_dir.glob("*.nc"))
        else:
            single = extract_dir / "data.nc"
            zip_path.rename(single)
            nc_files = [single]

        if not nc_files:
            print(f"    ERROR: no NC files in archive for {year}")
            return False

        all_ds = [xr.open_dataset(f) for f in nc_files]
        merged = xr.concat(all_ds, dim="time").sortby("time")
        for ds in all_ds:
            ds.close()

        months_written = 0
        for month in range(1, 13):
            out_file = RAW_DIR / f"{year}-{month:02d}.nc"
            month_data = merged.sel(time=merged.time.dt.month == month)
            if month_data.sizes["time"] == 0:
                continue
            month_data.to_netcdf(out_file)
            months_written += 1

        merged.close()
        print(f"    Split into {months_written} monthly files")
        return True

    except Exception as e:
        print(f"    ERROR processing {year}: {e}")
        return False
    finally:
        for f in extract_dir.glob("*"):
            f.unlink()
        if extract_dir.exists():
            extract_dir.rmdir()
        if zip_path.exists():
            zip_path.unlink()


def submit_job(client, year: int) -> str | None:
    """Submit a new CDS request, return job_id."""
    try:
        remote = client.submit(DATASET, make_request(year))
        job_id = remote.request_id
        print(f"    Submitted job {job_id}", flush=True)
        return job_id
    except Exception as e:
        print(f"    ERROR submitting {year}: {e}", flush=True)
        return None


def process_successful_job(client, year: int, job_id: str) -> bool:
    """Download and split a successful job."""
    zip_path = RAW_DIR / f"{year}.tmp.zip"
    try:
        print(f"    Downloading results for {year}...", flush=True)
        client.download_results(job_id, str(zip_path))
        return extract_and_split(zip_path, year)
    except Exception as e:
        print(f"    ERROR downloading {year}: {e}", flush=True)
        if zip_path.exists():
            zip_path.unlink()
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
    print("  ERA5-HEAT UTCI Daily Stats Downloader (resilient, parallel)")
    print(f"  Period: {START_YEAR}–{END_YEAR} (10 years)")
    print(f"  Output: {RAW_DIR.resolve()}")
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
                # Failed, expired, or not found — resubmit
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
        print(f"\n  Downloading {year} (job {job_id[:8]}...)...", flush=True)
        if process_successful_job(client, year, job_id):
            complete.append(year)

    # Phase 4: poll remaining jobs until all done
    while needs_poll:
        pending_years = [y for y, _ in needs_poll]
        elapsed = format_time(time.time() - start_time)
        print(f"\n  [{elapsed}] Waiting for {len(needs_poll)} jobs: {pending_years}",
              flush=True)
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
                print(f"  {year}: ready! Downloading...", flush=True)
                if process_successful_job(client, year, job_id):
                    complete.append(year)
                else:
                    print(f"    {year}: download failed, will retry", flush=True)
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
        print(f"  All {len(YEARS)} years downloaded successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
