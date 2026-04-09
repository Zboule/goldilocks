"""
Transform raw 6-hourly ERA5 0.25° data into 36-period climatological statistics.

Each month is split into 3 periods:
  - Early (days 1-10), Mid (days 11-20), Late (days 21-end)
  → 12 months × 3 = 36 periods per year

Memory-efficient: loads one month at a time (~5 GB per variable).
Uses pure numpy for all aggregation (no xarray resample — it OOMs).

Output: data/processed/<variable>_periods.nc  (36 periods × 1440 lon × 721 lat)
"""

import xarray as xr
import numpy as np
import gc
import os
import time
import calendar
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

RAW_DIR = Path("data/raw_025")
OUT_DIR = Path("data/processed")

STAT_NAMES = ["mean", "median", "min", "max", "p10", "p90"]
YEARS = list(range(2013, 2024))
END_YEAR_MONTH = (2023, 1)

PERIOD_LABELS = []
for m in range(1, 13):
    mname = calendar.month_abbr[m]
    PERIOD_LABELS.append(f"Early {mname}")
    PERIOD_LABELS.append(f"Mid {mname}")
    PERIOD_LABELS.append(f"Late {mname}")


def log(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}", flush=True)


def period_index(month: int, sub: int) -> int:
    return (month - 1) * 3 + sub


def load_month_raw(var_name: str, month: int):
    """
    Load all years for a variable+month into numpy arrays.
    Returns (vals, times, lon_coords, lat_coords) or None.
    Loads files one-by-one to avoid xarray overhead.
    """
    all_vals = []
    all_times = []
    lon_coords = lat_coords = None

    for year in YEARS:
        if year == END_YEAR_MONTH[0] and month > END_YEAR_MONTH[1]:
            continue
        f = RAW_DIR / var_name / f"{year}-{month:02d}.nc"
        if not f.exists():
            continue

        ds = xr.open_dataset(f)
        da = ds[var_name]
        all_vals.append(da.values)
        all_times.append(da.time.values)
        if lon_coords is None:
            lon_coords = da.longitude.values
            lat_coords = da.latitude.values
        ds.close()

    if not all_vals:
        return None

    vals = np.concatenate(all_vals, axis=0)
    times = np.concatenate(all_times, axis=0)
    del all_vals, all_times
    gc.collect()

    return vals, times, lon_coords, lat_coords


def get_day_of_month(times: np.ndarray) -> np.ndarray:
    """Extract day-of-month from numpy datetime64 array."""
    days_since_epoch = times.astype("datetime64[D]").astype(np.int64)
    months_start = times.astype("datetime64[M]").astype("datetime64[D]").astype(np.int64)
    return (days_since_epoch - months_start + 1).astype(np.int32)


def daily_agg_numpy(vals: np.ndarray, agg: str) -> np.ndarray:
    """
    Aggregate 6-hourly data to daily using numpy reshape.
    vals: (timesteps, lat, lon) with exactly 4 readings per day.
    Returns: (days, lat, lon)
    """
    n_timesteps = vals.shape[0]
    n_days = n_timesteps // 4
    reshaped = vals[:n_days * 4].reshape(n_days, 4, vals.shape[1], vals.shape[2])
    if agg == "max":
        return reshaped.max(axis=1)
    elif agg == "min":
        return reshaped.min(axis=1)
    elif agg == "sum":
        return reshaped.sum(axis=1)
    elif agg == "mean":
        return reshaped.mean(axis=1)
    raise ValueError(f"Unknown agg: {agg}")


def daily_times_from_6h(times: np.ndarray) -> np.ndarray:
    """Get one timestamp per day from 6-hourly times (take every 4th)."""
    n_days = len(times) // 4
    return times[:n_days * 4:4]


def compute_stats_for_pool(pool: np.ndarray) -> dict:
    pcts = np.nanpercentile(pool, [10, 50, 90], axis=0)
    return {
        "mean": np.nanmean(pool, axis=0).astype(np.float32),
        "median": pcts[1].astype(np.float32),
        "min": np.nanmin(pool, axis=0).astype(np.float32),
        "max": np.nanmax(pool, axis=0).astype(np.float32),
        "p10": pcts[0].astype(np.float32),
        "p90": pcts[2].astype(np.float32),
    }


def period_mask(day_of_month: np.ndarray, sub: int) -> np.ndarray:
    if sub == 0:
        return day_of_month <= 10
    elif sub == 1:
        return (day_of_month >= 11) & (day_of_month <= 20)
    return day_of_month >= 21


def process_temperature(mode: str):
    name = f"temperature_{mode}"
    agg = "max" if mode == "day" else "min"
    print(f"\n{'='*60}\n  Processing: {name} (daily {agg})\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading 2m_temperature...")
        loaded = load_month_raw("2m_temperature", month)
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        log(f"  Loaded {vals.shape[0]} timesteps, {vals.nbytes / 1e9:.1f} GB")

        vals_c = (vals - 273.15).astype(np.float32)
        del vals
        gc.collect()

        log(f"  Computing daily {agg} (numpy reshape)...")
        daily_vals = daily_agg_numpy(vals_c, agg)
        daily_dom = get_day_of_month(daily_times_from_6h(times))
        del vals_c, times
        gc.collect()

        log(f"  Daily: {daily_vals.shape[0]} days, {daily_vals.nbytes / 1e9:.1f} GB")

        for sub in range(3):
            pidx = period_index(month, sub)
            mask = period_mask(daily_dom, sub)
            pool = daily_vals[mask]
            if pool.shape[0] == 0:
                continue
            stats = compute_stats_for_pool(pool)
            for s in STAT_NAMES:
                results[s][pidx] = stats[s]

        del daily_vals, daily_dom
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = f"{'Daytime (daily max)' if mode == 'day' else 'Nighttime (daily min)'} temperature, 36-period stats (2013-2023), 0.25°"

    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_wind():
    name = "wind_speed"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading u+v wind...")
        loaded_u = load_month_raw("10m_u_component_of_wind", month)
        loaded_v = load_month_raw("10m_v_component_of_wind", month)
        if loaded_u is None or loaded_v is None:
            continue
        u_vals, times, lons, lats = loaded_u
        v_vals = loaded_v[0]
        del loaded_u, loaded_v
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        log(f"  Loaded {u_vals.shape[0]} timesteps, {(u_vals.nbytes + v_vals.nbytes) / 1e9:.1f} GB")

        # In-place computation to avoid large temporaries
        np.square(u_vals, out=u_vals)
        np.square(v_vals, out=v_vals)
        u_vals += v_vals
        del v_vals
        gc.collect()
        np.sqrt(u_vals, out=u_vals)
        speed = u_vals
        del u_vals
        gc.collect()

        dom = get_day_of_month(times)
        del times

        for sub in range(3):
            pidx = period_index(month, sub)
            mask = period_mask(dom, sub)
            pool = speed[mask]
            if pool.shape[0] == 0:
                continue
            stats = compute_stats_for_pool(pool)
            for s in STAT_NAMES:
                results[s][pidx] = stats[s]

        del speed, dom
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = "wind_speed"
    ds.attrs["units"] = "m/s"
    ds.attrs["description"] = "10m wind speed, 36-period stats from 6h readings (2013-2023), 0.25°"

    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_precipitation():
    name = "precipitation"
    print(f"\n{'='*60}\n  Processing: {name} (daily sums)\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading total_precipitation_6hr...")
        loaded = load_month_raw("total_precipitation_6hr", month)
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        vals_mm = (vals * 1000).astype(np.float32)
        del vals
        gc.collect()

        log(f"  Computing daily sums (numpy reshape)...")
        daily_vals = daily_agg_numpy(vals_mm, "sum")
        daily_dom = get_day_of_month(daily_times_from_6h(times))
        del vals_mm, times
        gc.collect()

        for sub in range(3):
            pidx = period_index(month, sub)
            mask = period_mask(daily_dom, sub)
            pool = daily_vals[mask]
            if pool.shape[0] == 0:
                continue
            stats = compute_stats_for_pool(pool)
            for s in STAT_NAMES:
                results[s][pidx] = stats[s]

        del daily_vals, daily_dom
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = "precipitation"
    ds.attrs["units"] = "mm/day"
    ds.attrs["description"] = "Total precipitation (daily sums), 36-period stats (2013-2023), 0.25°"

    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_rainy_days():
    name = "rainy_days"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading total_precipitation_6hr...")
        loaded = load_month_raw("total_precipitation_6hr", month)
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        vals_mm = (vals * 1000).astype(np.float32)
        del vals
        gc.collect()

        n_timesteps = vals_mm.shape[0]
        n_days = n_timesteps // 4
        reshaped = vals_mm[:n_days * 4].reshape(n_days, 4, vals_mm.shape[1], vals_mm.shape[2])
        del vals_mm
        gc.collect()

        rainy_count = (reshaped > 0.5).sum(axis=1)
        is_allday_rain = (rainy_count >= 3).astype(np.float32)
        del reshaped, rainy_count
        gc.collect()

        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)

        daily_years = daily_t.astype("datetime64[Y]").astype(int) + 1970
        unique_years = np.unique(daily_years)
        del times

        for sub in range(3):
            pidx = period_index(month, sub)
            dmask = period_mask(daily_dom, sub)

            year_fractions = []
            for yr in unique_years:
                yr_mask = dmask & (daily_years == yr)
                if yr_mask.sum() == 0:
                    continue
                frac = is_allday_rain[yr_mask].mean(axis=0)
                year_fractions.append(frac)

            if not year_fractions:
                continue

            pool = np.array(year_fractions)
            stats = compute_stats_for_pool(pool)
            for s in STAT_NAMES:
                results[s][pidx] = stats[s]

        del is_allday_rain
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = "rainy_days"
    ds.attrs["units"] = "fraction"
    ds.attrs["description"] = "Fraction of all-day rainy days (3+ of 4 six-hour periods >0.5mm), 36-period stats (2013-2023), 0.25°"

    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_simple_6h(var_raw: str, var_out: str, transform=None,
                      units: str = "", description: str = ""):
    print(f"\n{'='*60}\n  Processing: {var_out}\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading {var_raw}...")
        loaded = load_month_raw(var_raw, month)
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        if transform is not None:
            vals = transform(vals).astype(np.float32)

        dom = get_day_of_month(times)
        del times

        for sub in range(3):
            pidx = period_index(month, sub)
            mask = period_mask(dom, sub)
            pool = vals[mask]
            if pool.shape[0] == 0:
                continue
            stats = compute_stats_for_pool(pool)
            for s in STAT_NAMES:
                results[s][pidx] = stats[s]

        del vals, dom
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = var_out
    ds.attrs["units"] = units
    ds.attrs["description"] = description

    out = OUT_DIR / f"{var_out}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def _build_dataset(results: dict, lon_coords, lat_coords) -> xr.Dataset:
    coords = {
        "period": ("period", np.arange(1, 37, dtype=np.int32)),
        "longitude": ("longitude", lon_coords),
        "latitude": ("latitude", lat_coords),
    }

    ds = xr.Dataset()
    for stat_name in STAT_NAMES:
        ds[stat_name] = xr.DataArray(
            results[stat_name],
            dims=["period", "latitude", "longitude"],
            coords=coords,
        )

    ds["period_label"] = xr.DataArray(PERIOD_LABELS, dims=["period"],
                                       coords={"period": np.arange(1, 37, dtype=np.int32)})
    return ds


def main():
    print("=" * 60)
    print("  ERA5 0.25° → 36-Period Climatological Stats")
    print(f"  CPUs: {os.cpu_count()}")
    print(f"  Input:  {RAW_DIR}/<var>/*.nc (6-hourly, {len(YEARS)} years, 0.25°)")
    print(f"  Output: {OUT_DIR}/*_periods.nc (36 periods × 721 lat × 1440 lon)")
    print(f"  Periods: Early/Mid/Late × 12 months (days 1-10, 11-20, 21-end)")
    print(f"  Stats: {', '.join(STAT_NAMES)}")
    print(f"  Method: pure numpy (no xarray resample)")
    print("=" * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    def skip_if_done(name: str) -> bool:
        out = OUT_DIR / f"{name}_periods.nc"
        if out.exists():
            log(f"SKIP {name} — already exists ({out.stat().st_size / 1e6:.1f} MB)")
            return True
        return False

    if not skip_if_done("temperature_day"):
        process_temperature("day")
    if not skip_if_done("temperature_night"):
        process_temperature("night")
    if not skip_if_done("wind_speed"):
        process_wind()
    if not skip_if_done("precipitation"):
        process_precipitation()
    if not skip_if_done("rainy_days"):
        process_rainy_days()

    if not skip_if_done("sunshine"):
        process_simple_6h(
            "total_cloud_cover", "sunshine",
            transform=lambda v: 1.0 - v,
            units="fraction (0=overcast, 1=clear)",
            description="Sunshine fraction (1 - cloud cover), 36-period stats from 6h readings (2013-2023), 0.25°",
        )
    if not skip_if_done("cloud_cover"):
        process_simple_6h(
            "total_cloud_cover", "cloud_cover",
            units="fraction (0=clear, 1=overcast)",
            description="Total cloud cover, 36-period stats from 6h readings (2013-2023), 0.25°",
        )

    print(f"\n{'='*60}")
    print("  All done. Output files:")
    total = 0
    for f in sorted(OUT_DIR.glob("*_periods.nc")):
        sz = f.stat().st_size / 1e6
        total += sz
        print(f"    {f.name:40s} {sz:6.1f} MB")
    print(f"    {'TOTAL':40s} {total:6.1f} MB")
    print("=" * 60)


if __name__ == "__main__":
    main()
