"""
Test the Enjoyable Climate filter against 20 famously pleasant places at their best time.

For each place, loads the actual processed data at its coordinates and period,
evaluates every filter criterion, and produces a pass/fail report.

Usage: python data/test_enjoyable_filter.py
"""

import json
import numpy as np
import xarray as xr
from pathlib import Path

PROCESSED_DIR = Path("data/processed")

ENJOYABLE_FILTERS = [
    {"variable": "utci_day",    "stat": "median", "op": "between", "lo": 14, "hi": 32},
    {"variable": "utci_day",    "stat": "p90",    "op": "<",       "val": 38},
    {"variable": "utci_day",    "stat": "p10",    "op": ">",       "val": 5},
    {"variable": "temperature_night", "stat": "median", "op": "between", "lo": 8, "hi": 26},
    {"variable": "utci_night",  "stat": "p90",    "op": "<",       "val": 26},
    {"variable": "rainy_hours_day", "stat": "median", "op": "<",   "val": 0.15},
    {"variable": "wind_speed",  "stat": "p90",    "op": "<",       "val": 10},
]

# 20 famously pleasant places at their best season
# (name, lat, lon, period_label, expected to pass)
TEST_PLACES = [
    ("Lisbon, Portugal",            38.7,   -9.1,  "Mid Oct",    True),
    ("Barcelona, Spain",            41.4,    2.2,  "Mid May",    True),
    ("Nice, France",                43.7,    7.3,  "Mid Jun",    True),
    ("Santorini, Greece",           36.4,   25.4,  "Mid Jun",    True),
    ("Cape Town, South Africa",    -33.9,   18.4,  "Mid Feb",    True),
    ("San Diego, USA",              32.7, -117.2,  "Mid May",    True),
    ("Canary Islands, Spain",       28.1,  -15.4,  "Mid Mar",    True),
    ("Algarve, Portugal",           37.0,   -7.9,  "Mid Jun",    True),
    ("Amalfi Coast, Italy",         40.6,   14.6,  "Mid Jun",    True),
    ("Kyoto, Japan",                35.0,  135.8,  "Mid Apr",    True),
    ("Sydney, Australia",          -33.9,  151.2,  "Mid Oct",    True),
    ("Queenstown, New Zealand",    -45.0,  168.7,  "Mid Feb",    True),
    ("Dubrovnik, Croatia",          42.6,   18.1,  "Mid Jun",    True),
    ("Marrakech, Morocco",          31.6,   -8.0,  "Mid Apr",    True),
    ("Oaxaca, Mexico",              17.1,  -96.7,  "Mid Feb",    True),
    ("Sardinia, Italy",             39.2,    9.1,  "Mid Jun",    True),
    ("Malaga, Spain",               36.7,   -4.4,  "Mid May",    True),
    ("Valletta, Malta",             35.9,   14.5,  "Mid May",    True),
    ("Buenos Aires, Argentina",    -34.6,  -58.4,  "Mid Nov",    True),
    ("Funchal, Madeira",            32.6,  -16.9,  "Mid Jul",    True),
    # --- Negative cases: famously unpleasant at these times ---
    ("Dubai, UAE — summer",          25.2,   55.3,  "Mid Aug",    False),
    ("London, UK — November",        51.5,   -0.1,  "Mid Nov",    False),
    ("Mumbai, India — monsoon",      19.1,   72.9,  "Mid Jul",    False),
    ("Singapore — any time",          1.3,  103.8,  "Mid Jun",    False),
    ("Reykjavik — winter",           64.1,  -21.9,  "Mid Jan",    False),
    ("Bangkok — hottest month",      13.8,  100.5,  "Mid Apr",    False),
    ("Moscow — winter",              55.8,   37.6,  "Mid Jan",    False),
    ("Dhaka — monsoon",              23.8,   90.4,  "Mid Jul",    False),
    ("Phoenix, USA — summer",        33.4, -112.0,  "Mid Jul",    False),
    ("Yakutsk, Russia — winter",     62.0,  129.7,  "Mid Jan",    False),
    # --- Borderline negative: not terrible, just not great ---
    ("Berlin — Oct (too cool)",       52.5,   13.4,  "Mid Oct",    False),
    ("Seattle — Mar (grey+rainy)",    47.6, -122.3,  "Mid Mar",    False),
    ("Shanghai — Jul (hot+humid)",    31.2,  121.5,  "Mid Jul",    False),
    ("Edinburgh — Jul (best month!)", 55.9,   -3.2,  "Mid Jul",    False),
    ("Taipei — Jun (hot+rainy)",      25.0,  121.5,  "Mid Jun",    False),
    ("Bogota — Mar (rainy)",           4.7,  -74.1,  "Mid Mar",    False),
    ("Istanbul — Mar (cold+windy)",   41.0,   29.0,  "Mid Mar",    False),
    ("Lima — Aug (grey+cool)",       -12.0,  -77.0,  "Mid Aug",    False),
]

PERIOD_LABELS = []
import calendar
for m in range(1, 13):
    mname = calendar.month_abbr[m]
    PERIOD_LABELS.append(f"Early {mname}")
    PERIOD_LABELS.append(f"Mid {mname}")
    PERIOD_LABELS.append(f"Late {mname}")


def label_to_period_idx(label: str) -> int:
    return PERIOD_LABELS.index(label)


def evaluate(op, value, lo=None, hi=None, val=None):
    if np.isnan(value):
        return False
    if op == "between":
        return lo <= value <= hi
    elif op == "<":
        return value < val
    elif op == ">":
        return value > val
    return False


def main():
    # Load all needed datasets
    datasets = {}
    needed_vars = set(f["variable"] for f in ENJOYABLE_FILTERS)
    for var in needed_vars:
        path = PROCESSED_DIR / f"{var}_periods.nc"
        if not path.exists():
            print(f"MISSING: {path}")
            return
        datasets[var] = xr.open_dataset(path)

    ds0 = list(datasets.values())[0]
    lats = ds0.latitude.values
    lons = ds0.longitude.values

    results = []

    for name, lat, lon, period_label, expected in TEST_PLACES:
        period_idx = label_to_period_idx(period_label)

        lookup_lon = lon if lon >= 0 else lon + 360
        lat_idx = int(np.argmin(np.abs(lats - lat)))
        lon_idx = int(np.argmin(np.abs(lons - lookup_lon)))
        actual_lat = lats[lat_idx]
        actual_lon = lons[lon_idx]
        if actual_lon > 180:
            actual_lon -= 360

        filter_results = []
        all_pass = True
        for f in ENJOYABLE_FILTERS:
            ds = datasets[f["variable"]]
            value = float(ds[f["stat"]].values[period_idx, lat_idx, lon_idx])
            if f["op"] == "between":
                passes = evaluate(f["op"], value, lo=f["lo"], hi=f["hi"])
                desc = f'{f["variable"]} {f["stat"]} {value:.1f} in [{f["lo"]}, {f["hi"]}]'
            else:
                passes = evaluate(f["op"], value, val=f["val"])
                desc = f'{f["variable"]} {f["stat"]} {value:.1f} {f["op"]} {f["val"]}'
            filter_results.append((desc, passes))
            if not passes:
                all_pass = False

        correct = (all_pass == expected)
        results.append((name, period_label, actual_lat, actual_lon, all_pass, expected, correct, filter_results))

    # Print report
    positives = [(r) for r in results if r[5]]
    negatives = [(r) for r in results if not r[5]]

    print("=" * 90)
    print("  Enjoyable Climate Filter — Validation Report")
    print("=" * 90)

    print(f"\n  --- POSITIVE CASES (should PASS) ---\n")
    for name, period, alat, alon, all_pass, expected, correct, frs in positives:
        icon = "OK" if correct else "!!"
        status = "PASS" if all_pass else "FAIL"
        print(f"  [{icon}] {status}  {name} — {period} ({alat:.1f}°, {alon:.1f}°)")
        if not correct:
            for desc, passes in frs:
                if not passes:
                    print(f"         ✗ {desc}")

    print(f"\n  --- NEGATIVE CASES (should FAIL) ---\n")
    for name, period, alat, alon, all_pass, expected, correct, frs in negatives:
        icon = "OK" if correct else "!!"
        status = "PASS" if all_pass else "FAIL"
        print(f"  [{icon}] {status}  {name} — {period} ({alat:.1f}°, {alon:.1f}°)")
        failing = [d for d, p in frs if not p]
        if failing:
            print(f"         Rejected by: {'; '.join(failing)}")
        if not correct:
            print(f"         *** UNEXPECTED PASS — filter may be too loose! ***")

    # Summary
    pos_correct = sum(1 for r in positives if r[6])
    neg_correct = sum(1 for r in negatives if r[6])
    total_correct = pos_correct + neg_correct

    print(f"\n{'=' * 90}")
    print(f"  Positive cases: {pos_correct}/{len(positives)} correct (pleasant places pass)")
    print(f"  Negative cases: {neg_correct}/{len(negatives)} correct (unpleasant places rejected)")
    print(f"  Overall: {total_correct}/{len(results)} correct ({100*total_correct/len(results):.0f}%)")
    print("=" * 90)

    for ds in datasets.values():
        ds.close()


if __name__ == "__main__":
    main()
