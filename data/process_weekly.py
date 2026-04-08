"""
Transform raw 6-hourly ERA5 data into weekly climatological statistics.

Pipeline per variable:
  1. Read raw 6h data from data/raw/<variable>.nc
  2. Assign each 6h reading to its ISO week (1-53)
  3. For each ISO week, pool ALL 6h readings across 10 years (~280 per week)
  4. Compute stats: mean, median, min, max, P10, P90
  5. Save to data/processed/<variable>_weekly.nc

Exception: precipitation uses daily sums (sum of 4 x 6h per day) before
weekly stats, since rain is cumulative — stats represent mm/day.

Special handling:
  - Wind: combine u + v components into wind speed, output one file
  - Temperature: convert K -> °C
  - Precipitation: convert m -> mm, daily sum then weekly stats of daily totals
  - Cloud cover: invert to "sunshine" (1 - cloud_cover), keep as fraction
"""

import xarray as xr
import numpy as np
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

RAW_DIR = Path("data/raw")
OUT_DIR = Path("data/processed")

STAT_NAMES = ["mean", "median", "min", "max", "p10", "p90"]


def compute_weekly_stats(data: xr.DataArray) -> xr.Dataset:
    """
    For each ISO week (1-53), pool all timestep values across all years
    and compute mean, median, min, max, P10, P90.

    Input can be 6-hourly (for temperature, wind, sunshine, cloud cover)
    or daily (for precipitation).

    Returns a Dataset with dimensions (week, longitude, latitude)
    and one variable per stat.
    """
    weeks = data.time.dt.isocalendar().week.values
    unique_weeks = np.sort(np.unique(weeks))

    shape = (len(unique_weeks), data.sizes["longitude"], data.sizes["latitude"])
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}

    vals = data.values  # (time, lon, lat)

    for i, w in enumerate(unique_weeks):
        mask = weeks == w
        pool = vals[mask]

        results["mean"][i] = np.nanmean(pool, axis=0)
        results["median"][i] = np.nanmedian(pool, axis=0)
        results["min"][i] = np.nanmin(pool, axis=0)
        results["max"][i] = np.nanmax(pool, axis=0)
        results["p10"][i] = np.nanpercentile(pool, 10, axis=0)
        results["p90"][i] = np.nanpercentile(pool, 90, axis=0)

    coords = {
        "week": ("week", unique_weeks.astype(np.int32)),
        "longitude": data.longitude,
        "latitude": data.latitude,
    }

    ds = xr.Dataset()
    for stat_name in STAT_NAMES:
        ds[stat_name] = xr.DataArray(
            results[stat_name],
            dims=["week", "longitude", "latitude"],
            coords=coords,
        )

    return ds


def process_temperature_day():
    """Day temperature: daily max of 6h readings (≈ daytime high), then weekly stats."""
    name = "temperature_day"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "2m_temperature.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    data_c = raw - 273.15
    print("  Computing daily max (daytime high)...", flush=True)
    daily_max = data_c.resample(time="1D").max()
    print(f"  Daily shape: {daily_max.shape}")

    print("  Computing weekly stats from daily highs across 10 years...", flush=True)
    ds = compute_weekly_stats(daily_max)
    ds.attrs["variable"] = "temperature_day"
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = "Daytime temperature (daily max), weekly stats (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_temperature_night():
    """Night temperature: daily min of 6h readings (≈ nighttime low), then weekly stats."""
    name = "temperature_night"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "2m_temperature.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    data_c = raw - 273.15
    print("  Computing daily min (nighttime low)...", flush=True)
    daily_min = data_c.resample(time="1D").min()
    print(f"  Daily shape: {daily_min.shape}")

    print("  Computing weekly stats from daily lows across 10 years...", flush=True)
    ds = compute_weekly_stats(daily_min)
    ds.attrs["variable"] = "temperature_night"
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = "Nighttime temperature (daily min), weekly stats (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_wind():
    """Wind speed from u + v components: sqrt(u² + v²), weekly stats from 6h readings."""
    name = "wind_speed"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    u = xr.open_dataarray(RAW_DIR / "10m_u_component_of_wind.nc")
    v = xr.open_dataarray(RAW_DIR / "10m_v_component_of_wind.nc")
    print(f"  Raw shape: {u.shape} ({u.size * 4 / 1e9:.1f} GB each)")

    print("  Computing wind speed = sqrt(u² + v²)...", flush=True)
    speed = np.sqrt(u**2 + v**2)
    speed.attrs["units"] = "m/s"

    print("  Computing weekly stats from 6h readings across 10 years...", flush=True)
    ds = compute_weekly_stats(speed)
    ds.attrs["variable"] = "wind_speed"
    ds.attrs["units"] = "m/s"
    ds.attrs["description"] = "10m wind speed, weekly stats from 6h readings (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_precipitation():
    """Precipitation: m -> mm, daily sum of 6h values, then weekly stats of daily totals."""
    name = "precipitation"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "total_precipitation_6hr.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    raw_mm = raw * 1000
    raw_mm.attrs["units"] = "mm"

    print("  Computing daily sums...", flush=True)
    daily = raw_mm.resample(time="1D").sum()
    print(f"  Daily shape: {daily.shape}")

    print("  Computing weekly stats from daily totals across 10 years...", flush=True)
    ds = compute_weekly_stats(daily)
    ds.attrs["variable"] = "precipitation"
    ds.attrs["units"] = "mm/day"
    ds.attrs["description"] = "Total precipitation (daily sums), weekly stats (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_rainy_days():
    """Fraction of all-day rainy days (3+ out of 4 six-hour periods with >0.5mm) per week."""
    name = "rainy_days"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "total_precipitation_6hr.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    raw_mm = raw * 1000
    vals_6h = raw_mm.values  # (timesteps, lon, lat)

    n_timesteps = vals_6h.shape[0]
    n_days = n_timesteps // 4
    print(f"  Reshaping {n_timesteps} 6h periods into {n_days} days...")

    # Reshape to (days, 4_periods, lon, lat)
    vals_daily = vals_6h[:n_days * 4].reshape(n_days, 4, vals_6h.shape[1], vals_6h.shape[2])

    # Count how many of the 4 periods had rain > 0.5mm per day
    rainy_periods = (vals_daily > 0.5).sum(axis=1)  # (days, lon, lat), values 0-4

    # All-day rain = 3+ out of 4 periods
    is_allday_rain = (rainy_periods >= 3).astype(np.float32)  # (days, lon, lat)

    # Get daily timestamps (one per day, take the first 6h period)
    daily_times = raw_mm.time.values[:n_days * 4:4]

    print("  Computing all-day rain fraction per ISO week per year...", flush=True)
    daily_times_pd = np.array(daily_times, dtype="datetime64[ns]")
    import pandas as pd
    dt_index = pd.DatetimeIndex(daily_times_pd)
    weeks = np.array(dt_index.isocalendar().week, dtype=np.int32)
    years = np.array(dt_index.year, dtype=np.int32)

    unique_weeks = np.sort(np.unique(weeks))
    unique_years = np.sort(np.unique(years))

    weekly_fractions = []
    weekly_ids = []

    for yr in unique_years:
        for w in unique_weeks:
            mask = (weeks == w) & (years == yr)
            if mask.sum() == 0:
                continue
            pool = is_allday_rain[mask]
            frac = pool.mean(axis=0)
            weekly_fractions.append(frac)
            weekly_ids.append(w)

    weekly_fractions = np.array(weekly_fractions)
    weekly_ids = np.array(weekly_ids)

    n_lon = raw_mm.sizes["longitude"]
    n_lat = raw_mm.sizes["latitude"]
    shape = (len(unique_weeks), n_lon, n_lat)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}

    for i, w in enumerate(unique_weeks):
        mask = weekly_ids == w
        pool = weekly_fractions[mask]
        results["mean"][i] = np.nanmean(pool, axis=0)
        results["median"][i] = np.nanmedian(pool, axis=0)
        results["min"][i] = np.nanmin(pool, axis=0)
        results["max"][i] = np.nanmax(pool, axis=0)
        results["p10"][i] = np.nanpercentile(pool, 10, axis=0)
        results["p90"][i] = np.nanpercentile(pool, 90, axis=0)

    coords = {
        "week": ("week", unique_weeks.astype(np.int32)),
        "longitude": raw_mm.longitude,
        "latitude": raw_mm.latitude,
    }

    ds = xr.Dataset()
    for stat_name in STAT_NAMES:
        ds[stat_name] = xr.DataArray(
            results[stat_name],
            dims=["week", "longitude", "latitude"],
            coords=coords,
        )

    ds.attrs["variable"] = "rainy_days"
    ds.attrs["units"] = "fraction"
    ds.attrs["description"] = "Fraction of all-day rainy days (3+ of 4 six-hour periods >0.5mm) per week (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_sunshine():
    """Cloud cover -> sunshine: (1 - cloud_cover), weekly stats from 6h readings."""
    name = "sunshine"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "total_cloud_cover.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    data = 1.0 - raw
    data.attrs["units"] = "fraction (0=overcast, 1=clear)"

    print("  Computing weekly stats from 6h readings across 10 years...", flush=True)
    ds = compute_weekly_stats(data)
    ds.attrs["variable"] = "sunshine"
    ds.attrs["units"] = "fraction (0=overcast, 1=clear)"
    ds.attrs["description"] = "Sunshine fraction (1 - cloud cover), weekly stats from 6h readings (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def process_cloud_cover():
    """Cloud cover: weekly stats from 6h readings."""
    name = "cloud_cover"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t0 = time.time()

    raw = xr.open_dataarray(RAW_DIR / "total_cloud_cover.nc")
    print(f"  Raw shape: {raw.shape} ({raw.size * 4 / 1e9:.1f} GB)")

    print("  Computing weekly stats from 6h readings across 10 years...", flush=True)
    ds = compute_weekly_stats(raw)
    ds.attrs["variable"] = "cloud_cover"
    ds.attrs["units"] = "fraction (0=clear, 1=overcast)"
    ds.attrs["description"] = "Total cloud cover, weekly stats from 6h readings (2013-2023)"

    out = OUT_DIR / f"{name}_weekly.nc"
    ds.to_netcdf(out)
    print(f"  Saved: {out} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


def main():
    print("=" * 60)
    print("  Weekly Climatological Stats from ERA5 Raw Data")
    print("  Input:  data/raw/*.nc (6-hourly, 10 years, 1.5°)")
    print("  Output: data/processed/*_weekly.nc (53 weeks × 240 × 121)")
    print("  Stats:  mean, median, min, max, P10, P90")
    print("  Method: stats from all 6h readings per week (except precip: daily sums)")
    print("=" * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    process_temperature_day()
    process_temperature_night()
    process_wind()
    process_precipitation()
    process_rainy_days()
    process_sunshine()
    process_cloud_cover()

    print(f"\n{'='*60}")
    print("  All done. Output files:")
    total = 0
    for f in sorted(OUT_DIR.glob("*_weekly.nc")):
        sz = f.stat().st_size / 1e6
        total += sz
        print(f"    {f.name:40s} {sz:6.1f} MB")
    print(f"    {'TOTAL':40s} {total:6.1f} MB")
    print("=" * 60)


if __name__ == "__main__":
    main()
