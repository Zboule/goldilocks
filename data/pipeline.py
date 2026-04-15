#!/usr/bin/env python3
"""
Goldilocks Data Pipeline — single entry point for the full rebuild.

Stages (run in order):
  1. download   — ERA5 from WeatherBench2 + UTCI from CDS
  2. process    — 36-period climatological stats for all variables
  3. tiles      — uint8 land-only binary tiles for the web viewer
  4. safety     — travel safety overlay (country advisories)

Usage:
  python data/pipeline.py                  # run everything
  python data/pipeline.py process tiles    # run specific stages
  python data/pipeline.py --dry-run        # show what would run

Stages are idempotent — they skip already-completed work.
Run inside tmux for long jobs: tmux new -s pipeline 'python data/pipeline.py'
"""

import subprocess
import sys
import time
from pathlib import Path

STAGES = {
    "download": {
        "label": "Download raw data (ERA5 + UTCI)",
        "scripts": [
            ("data/download_era5_025.py", "ERA5 from WeatherBench2"),
            ("data/download_utci.py", "UTCI from CDS (ERA5-HEAT)"),
            ("data/download_hourly_precip.py", "Hourly precipitation from CDS (rainy hours)"),
        ],
    },
    "process": {
        "label": "Process 36-period climatological stats",
        "scripts": [
            ("data/process_periods_025.py", "All variables (2013-2022, 601 lat)"),
        ],
    },
    "tiles": {
        "label": "Generate web tiles + manifest",
        "scripts": [
            ("data/generate_tiles_025.py", "uint8 land-only tiles for all variables"),
        ],
    },
    "safety": {
        "label": "Travel safety overlay",
        "scripts": [
            ("data/generate_travel_safety.py", "Country advisories (US + DE + CA)"),
        ],
    },
}

STAGE_ORDER = ["download", "process", "tiles", "safety"]


def run_stage(name: str, dry_run: bool = False) -> bool:
    stage = STAGES[name]
    print(f"\n{'='*60}")
    print(f"  Stage: {name} — {stage['label']}")
    print(f"{'='*60}")

    for script, desc in stage["scripts"]:
        path = Path(script)
        if not path.exists():
            print(f"  SKIP {script} — file not found")
            continue

        print(f"\n  Running: {script}")
        print(f"  ({desc})")

        if dry_run:
            print(f"  [dry-run] would run: python {script}")
            continue

        t0 = time.time()
        result = subprocess.run(
            [sys.executable, script],
            cwd=Path(__file__).resolve().parent.parent,
        )
        elapsed = time.time() - t0
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)

        if result.returncode != 0:
            print(f"\n  FAILED: {script} (exit code {result.returncode}) after {mins}m {secs}s")
            return False
        print(f"\n  OK: {script} in {mins}m {secs}s")

    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry_run = "--dry-run" in sys.argv

    if args:
        stages = args
        for s in stages:
            if s not in STAGES:
                print(f"Unknown stage: {s}")
                print(f"Available: {', '.join(STAGE_ORDER)}")
                sys.exit(1)
    else:
        stages = STAGE_ORDER

    print("=" * 60)
    print("  Goldilocks Data Pipeline")
    print(f"  Stages: {' → '.join(stages)}")
    if dry_run:
        print("  Mode: DRY RUN")
    print("=" * 60)

    t_start = time.time()
    for name in stages:
        if not run_stage(name, dry_run):
            print(f"\n  Pipeline STOPPED at stage '{name}'")
            sys.exit(1)

    total = time.time() - t_start
    h = int(total // 3600)
    m = int((total % 3600) // 60)
    print(f"\n{'='*60}")
    print(f"  Pipeline complete in {h}h {m:02d}m")
    print("=" * 60)


if __name__ == "__main__":
    main()
