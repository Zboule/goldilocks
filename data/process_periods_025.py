"""
Transform raw 6-hourly ERA5 0.25° data into 36-period climatological statistics.

Each month is split into 3 periods:
  - Early (days 1-10), Mid (days 11-20), Late (days 21-end)
  → 12 months × 3 = 36 periods per year

Stats per variable: mean, median, min, max, p10, p90, ystd
  - Pooled stats (mean..p90): computed over all daily/6h samples across years
  - ystd: interannual std of per-year period means (reliability measure)
  - Event-frequency vars (rainy_days, hot_days, etc.): year-normalized —
    stats computed across per-year fractions, not pooled daily values

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
from concurrent.futures import ThreadPoolExecutor

warnings.filterwarnings("ignore")

RAW_DIR = Path("data/raw_025")
OUT_DIR = Path("data/processed")

POOLED_STATS = ["mean", "median", "min", "max", "p10", "p90"]
STAT_NAMES = POOLED_STATS + ["ystd"]
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


def load_month_raw(var_name: str, month: int, nc_var: str | None = None):
    """
    Load all years for a variable+month into numpy arrays.
    Returns (vals, times, lon_coords, lat_coords) or None.
    nc_var overrides the NetCDF variable name when it differs from the directory name.
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
        da = ds[nc_var or var_name]
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


def load_year_month_raw(var_name: str, year: int, month: int, nc_var: str | None = None):
    """Load a single year+month for a variable. Returns (vals, times, lon, lat) or None.
    nc_var overrides the NetCDF variable name when it differs from the directory name."""
    f = RAW_DIR / var_name / f"{year}-{month:02d}.nc"
    if not f.exists():
        return None
    ds = xr.open_dataset(f)
    da = ds[nc_var or var_name]
    vals = da.values
    times = da.time.values
    lon_coords = da.longitude.values
    lat_coords = da.latitude.values
    ds.close()
    return vals, times, lon_coords, lat_coords


def valid_years_for_month(month: int) -> list:
    """Return list of years that have data for a given month."""
    return [y for y in YEARS
            if not (y == END_YEAR_MONTH[0] and month > END_YEAR_MONTH[1])]


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
    has_nan = np.isnan(pool).any()
    if has_nan:
        pcts = np.nanpercentile(pool, [10, 50, 90], axis=0)
        return {
            "mean": np.nanmean(pool, axis=0).astype(np.float32),
            "median": pcts[1].astype(np.float32),
            "min": np.nanmin(pool, axis=0).astype(np.float32),
            "max": np.nanmax(pool, axis=0).astype(np.float32),
            "p10": pcts[0].astype(np.float32),
            "p90": pcts[2].astype(np.float32),
        }
    pcts = np.percentile(pool, [10, 50, 90], axis=0)
    return {
        "mean": pool.mean(axis=0).astype(np.float32),
        "median": pcts[1].astype(np.float32),
        "min": pool.min(axis=0).astype(np.float32),
        "max": pool.max(axis=0).astype(np.float32),
        "p10": pcts[0].astype(np.float32),
        "p90": pcts[2].astype(np.float32),
    }


def period_mask(day_of_month: np.ndarray, sub: int) -> np.ndarray:
    if sub == 0:
        return day_of_month <= 10
    elif sub == 1:
        return (day_of_month >= 11) & (day_of_month <= 20)
    return day_of_month >= 21


def get_years_from_times(times: np.ndarray) -> np.ndarray:
    """Extract calendar year from numpy datetime64 array."""
    return times.astype("datetime64[Y]").astype(int) + 1970


def build_year_index(years: np.ndarray) -> dict:
    """Pre-compute per-year integer indices for fast sub-selection."""
    idx = {}
    for yr in np.unique(years):
        idx[yr] = np.where(years == yr)[0]
    return idx


def compute_interannual_std(values: np.ndarray, sub_indices: np.ndarray,
                            year_index: dict) -> np.ndarray:
    """Std of per-year period means across years.

    values: (n_samples, lat, lon)
    sub_indices: integer indices of samples in this sub-period
    year_index: {year: array of indices} from build_year_index
    Returns: (lat, lon) float32 array
    """
    sub_set = set(sub_indices.tolist()) if len(sub_indices) < 5000 else None
    year_means = []
    for yr, yr_indices in year_index.items():
        if sub_set is not None:
            overlap = np.array([i for i in yr_indices if i in sub_set], dtype=np.intp)
        else:
            overlap = np.intersect1d(sub_indices, yr_indices)
        if len(overlap) == 0:
            continue
        year_means.append(values[overlap].mean(axis=0))
    if len(year_means) < 2:
        return np.full(values.shape[1:], np.nan, dtype=np.float32)
    stacked = np.array(year_means)
    return stacked.std(axis=0).astype(np.float32)


_thread_pool = ThreadPoolExecutor(max_workers=3)


def compute_sub_period(daily_vals, sub, month, daily_dom, year_index, results):
    """Process one sub-period: pooled stats + ystd. Thread-safe (writes to separate slots)."""
    t0 = time.time()
    pidx = period_index(month, sub)
    mask = period_mask(daily_dom, sub)
    pool = daily_vals[mask]
    if pool.shape[0] == 0:
        return
    sub_indices = np.where(mask)[0]
    stats = compute_stats_for_pool(pool)
    for s, v in stats.items():
        results[s][pidx] = v
    results["ystd"][pidx] = compute_interannual_std(daily_vals, sub_indices, year_index)
    label = ["Early", "Mid", "Late"][sub]
    log(f"    {label}: {pool.shape[0]} samples, stats in {time.time()-t0:.1f}s")


def compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results):
    """Run 3 sub-periods in parallel threads."""
    year_index = build_year_index(daily_years)
    futures = [
        _thread_pool.submit(compute_sub_period, daily_vals, sub, month, daily_dom, year_index, results)
        for sub in range(3)
    ]
    for f in futures:
        f.result()


def compute_event_stats(is_event: np.ndarray, daily_dom: np.ndarray,
                        daily_years: np.ndarray, results: dict, month: int):
    """Compute per-year fraction stats for a binary daily event flag.

    is_event: (n_days, lat, lon) float32 0/1
    daily_dom: (n_days,) day of month
    daily_years: (n_days,) year per day
    results: dict of stat arrays to fill in-place
    month: current month (1-12)
    """
    unique_years = np.unique(daily_years)
    for sub in range(3):
        pidx = period_index(month, sub)
        dmask = period_mask(daily_dom, sub)

        year_fractions = []
        for yr in unique_years:
            yr_mask = dmask & (daily_years == yr)
            if yr_mask.sum() == 0:
                continue
            year_fractions.append(is_event[yr_mask].mean(axis=0))

        if not year_fractions:
            continue

        pool = np.array(year_fractions)
        stats = compute_stats_for_pool(pool)
        for s, v in stats.items():
            results[s][pidx] = v
        if pool.shape[0] >= 2:
            results["ystd"][pidx] = np.nanstd(pool, axis=0).astype(np.float32)


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
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals_c, times, daily_t
        gc.collect()

        log(f"  Daily: {daily_vals.shape[0]} days, {daily_vals.nbytes / 1e9:.1f} GB")

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
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
        step_years = get_years_from_times(times)
        del times

        compute_sub_periods_threaded(speed, month, dom, step_years, results)

        del speed, dom, step_years
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
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals_mm, times, daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
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
            for s, v in stats.items():
                results[s][pidx] = v
            if pool.shape[0] >= 2:
                results["ystd"][pidx] = np.nanstd(pool, axis=0).astype(np.float32)

        del is_allday_rain
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = "rainy_days"
    ds.attrs["units"] = "fraction"
    ds.attrs["stat_semantics"] = "year-normalized: stats are computed across per-year fractions, not pooled daily values"
    ds.attrs["description"] = "Fraction of all-day rainy days (3+ of 4 six-hour periods >0.5mm), 36-period stats over per-year fractions (2013-2023), 0.25°"

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
        step_years = get_years_from_times(times)
        del times

        compute_sub_periods_threaded(vals, month, dom, step_years, results)

        del vals, dom, step_years
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


def _save_event_variable(name: str, results: dict, lon_coords, lat_coords,
                         units: str, description: str, t_start: float):
    """Write an event-frequency variable NetCDF with year-normalized semantics."""
    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = units
    ds.attrs["stat_semantics"] = "year-normalized: stats are computed across per-year fractions, not pooled daily values"
    ds.attrs["description"] = description
    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_hot_days():
    """Fraction of days where daily max temperature > 35°C."""
    name = "hot_days"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
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

        daily_max = daily_agg_numpy((vals - 273.15).astype(np.float32), "max")
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals, times, daily_t
        gc.collect()

        is_hot = (daily_max > 35.0).astype(np.float32)
        del daily_max
        compute_event_stats(is_hot, daily_dom, daily_years, results, month)
        del is_hot, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    _save_event_variable(name, results, lon_coords, lat_coords,
                         "fraction", "Fraction of days with daily max temp > 35°C (2013-2023), 0.25°", t_start)


def process_heavy_rain_days():
    """Fraction of days where daily precipitation > 10mm."""
    name = "heavy_rain_days"
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

        daily_sum = daily_agg_numpy((vals * 1000).astype(np.float32), "sum")
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals, times, daily_t
        gc.collect()

        is_heavy = (daily_sum > 10.0).astype(np.float32)
        del daily_sum
        compute_event_stats(is_heavy, daily_dom, daily_years, results, month)
        del is_heavy, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    _save_event_variable(name, results, lon_coords, lat_coords,
                         "fraction", "Fraction of days with precip > 10mm (2013-2023), 0.25°", t_start)


def process_windy_days():
    """Fraction of days where max 6h wind speed > 8 m/s."""
    name = "windy_days"
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

        speed_6h = np.sqrt(u_vals**2 + v_vals**2).astype(np.float32)
        del u_vals, v_vals
        gc.collect()

        daily_max_speed = daily_agg_numpy(speed_6h, "max")
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del speed_6h, times, daily_t
        gc.collect()

        is_windy = (daily_max_speed > 8.0).astype(np.float32)
        del daily_max_speed
        compute_event_stats(is_windy, daily_dom, daily_years, results, month)
        del is_windy, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    _save_event_variable(name, results, lon_coords, lat_coords,
                         "fraction", "Fraction of days with max wind > 8 m/s (2013-2023), 0.25°", t_start)


def process_muggy_days():
    """Fraction of days where derived dew point > 18°C (from T + RH). Year-by-year."""
    name = "muggy_days"
    print(f"\n{'='*60}\n  Processing: {name} (year-by-year)\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: deriving muggy days from T + RH year-by-year...")
        all_daily_muggy = []
        all_daily_times = []

        for year in valid_years_for_month(month):
            lt = load_year_month_raw("2m_temperature", year, month)
            lrh = load_year_month_raw("relative_humidity_1000hPa", year, month,
                                      nc_var="relative_humidity")
            if lt is None or lrh is None:
                continue
            t_vals, times, lons, lats = lt
            rh_vals = lrh[0]
            del lt, lrh
            if lon_coords is None:
                lon_coords, lat_coords = lons, lats

            t_c = np.float32(t_vals - 273.15)
            rh = np.clip(rh_vals, 1e-6, 1.0).astype(np.float32)
            del t_vals, rh_vals

            gamma = np.log(rh) + (17.625 * t_c) / (243.04 + t_c)
            td_c = (243.04 * gamma / (17.625 - gamma)).astype(np.float32)
            del t_c, rh, gamma

            daily_td = daily_agg_numpy(td_c, "mean")
            del td_c
            is_muggy = (daily_td > 18.0).astype(np.float32)
            del daily_td

            all_daily_muggy.append(is_muggy)
            all_daily_times.append(daily_times_from_6h(times))
            del times
            gc.collect()

        if not all_daily_muggy:
            continue

        is_muggy_all = np.concatenate(all_daily_muggy, axis=0)
        daily_t = np.concatenate(all_daily_times, axis=0)
        del all_daily_muggy, all_daily_times
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del daily_t
        gc.collect()

        compute_event_stats(is_muggy_all, daily_dom, daily_years, results, month)
        del is_muggy_all, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    if lon_coords is None:
        log(f"SKIP {name} — no T + RH data found")
        return

    _save_event_variable(name, results, lon_coords, lat_coords,
                         "fraction", "Fraction of days with derived dew point > 18°C (2013-2023), 0.25°", t_start)


def process_dew_point():
    """Daily mean dew point derived from T + RH via inverse Magnus formula.
    Year-by-year to stay within memory limits."""
    name = "dew_point"
    print(f"\n{'='*60}\n  Processing: {name} (year-by-year)\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: deriving Td from T + RH year-by-year...")
        all_daily = []
        all_daily_times = []

        for year in valid_years_for_month(month):
            lt = load_year_month_raw("2m_temperature", year, month)
            lrh = load_year_month_raw("relative_humidity_1000hPa", year, month,
                                      nc_var="relative_humidity")
            if lt is None or lrh is None:
                continue
            t_vals, times, lons, lats = lt
            rh_vals = lrh[0]
            del lt, lrh
            if lon_coords is None:
                lon_coords, lat_coords = lons, lats

            t_c = np.float32(t_vals - 273.15)
            rh = np.clip(rh_vals, 1e-6, 1.0).astype(np.float32)
            del t_vals, rh_vals

            # Inverse Magnus: gamma = ln(RH) + 17.625*T/(243.04+T), Td = 243.04*gamma/(17.625-gamma)
            gamma = np.log(rh) + (17.625 * t_c) / (243.04 + t_c)
            td_c = (243.04 * gamma / (17.625 - gamma)).astype(np.float32)
            del t_c, rh, gamma
            gc.collect()

            daily = daily_agg_numpy(td_c, "mean")
            del td_c
            all_daily.append(daily)
            all_daily_times.append(daily_times_from_6h(times))
            del times
            gc.collect()

        if not all_daily:
            continue

        daily_vals = np.concatenate(all_daily, axis=0)
        daily_t = np.concatenate(all_daily_times, axis=0)
        del all_daily, all_daily_times
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    if lon_coords is None:
        log(f"SKIP {name} — no T + RH data found")
        return

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = "Dew point temperature (derived from T + RH at 1000hPa, daily mean), 36-period stats (2013-2023), 0.25°"
    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_relative_humidity():
    """Daily mean relative humidity from ERA5 1000 hPa RH (fraction 0-1 → %)."""
    name = "relative_humidity"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading relative_humidity_1000hPa...")
        loaded = load_month_raw("relative_humidity_1000hPa", month, nc_var="relative_humidity")
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        rh_pct = np.clip(vals * 100.0, 0, 100).astype(np.float32)
        del vals
        gc.collect()

        daily_vals = daily_agg_numpy(rh_pct, "mean")
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del rh_pct, times, daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    if lon_coords is None:
        log(f"SKIP {name} — no relative_humidity_1000hPa data found")
        return

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "%"
    ds.attrs["description"] = "Relative humidity at 1000 hPa (daily mean), 36-period stats (2013-2023), 0.25°"
    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_apparent_temperature(mode: str):
    """Apparent temperature using BOM formula: AT = T + 0.33*e - 0.70*ws - 4.00
    Loads one year at a time to stay within memory limits (~2.5 GB peak per year)."""
    name = f"apparent_temperature_{mode}"
    agg = "max" if mode == "day" else "min"
    print(f"\n{'='*60}\n  Processing: {name} (daily {agg}, year-by-year)\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: computing AT year-by-year...")
        all_daily = []
        all_daily_times = []

        for year in valid_years_for_month(month):
            lt = load_year_month_raw("2m_temperature", year, month)
            lrh = load_year_month_raw("relative_humidity_1000hPa", year, month,
                                      nc_var="relative_humidity")
            lu = load_year_month_raw("10m_u_component_of_wind", year, month)
            lv = load_year_month_raw("10m_v_component_of_wind", year, month)
            if any(x is None for x in [lt, lrh, lu, lv]):
                continue
            t_vals, times, lons, lats = lt
            rh_vals, u_vals, v_vals = lrh[0], lu[0], lv[0]
            del lt, lrh, lu, lv
            if lon_coords is None:
                lon_coords, lat_coords = lons, lats

            t_c = np.float32(t_vals - 273.15)
            rh = np.clip(rh_vals, 0, None).astype(np.float32)
            del t_vals, rh_vals

            np.square(u_vals, out=u_vals)
            np.square(v_vals, out=v_vals)
            u_vals += v_vals
            del v_vals
            np.sqrt(u_vals, out=u_vals)
            ws = u_vals
            del u_vals

            # BOM AT: e = RH * e_sat(T) where RH is 0-1 fraction
            e = np.empty_like(t_c)
            np.multiply(17.27, t_c, out=e)
            np.divide(e, np.float32(237.7) + t_c, out=e)
            np.exp(e, out=e)
            e *= 6.105
            e *= rh
            del rh

            at = t_c
            at += 0.33 * e
            at -= 0.70 * ws
            at -= 4.00
            del t_c, e, ws
            gc.collect()

            daily = daily_agg_numpy(at, agg)
            del at
            all_daily.append(daily)
            all_daily_times.append(daily_times_from_6h(times))
            del times
            gc.collect()

        if not all_daily:
            continue

        daily_vals = np.concatenate(all_daily, axis=0)
        daily_t = np.concatenate(all_daily_times, axis=0)
        del all_daily, all_daily_times
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    if lon_coords is None:
        log(f"SKIP {name} — no dew point data found")
        return

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = f"Apparent temperature BOM ({'daily max' if mode == 'day' else 'daily min'}), AT=T+0.33e-0.70ws-4.00 (2013-2023), 0.25°"
    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_solar_radiation():
    """TOA incident solar radiation converted from J/m² to W/m² (÷ 21600)."""
    name = "solar_radiation"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
    t_start = time.time()

    n_lat, n_lon = 721, 1440
    shape = (36, n_lat, n_lon)
    results = {s: np.full(shape, np.nan, dtype=np.float32) for s in STAT_NAMES}
    lon_coords = lat_coords = None

    for month in range(1, 13):
        t0 = time.time()
        log(f"Month {month:02d}: loading toa_incident_solar_radiation_6hr...")
        loaded = load_month_raw("toa_incident_solar_radiation_6hr", month)
        if loaded is None:
            continue
        vals, times, lons, lats = loaded
        if lon_coords is None:
            lon_coords, lat_coords = lons, lats

        # J/m² per 6h → W/m² (divide by 21600 seconds)
        vals_wm2 = (vals / 21600.0).astype(np.float32)
        np.clip(vals_wm2, 0, None, out=vals_wm2)
        del vals
        gc.collect()

        daily_vals = daily_agg_numpy(vals_wm2, "mean")
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals_wm2, times, daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    if lon_coords is None:
        log(f"SKIP {name} — no TOA solar data found")
        return

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "W/m²"
    ds.attrs["description"] = "TOA incident solar radiation (daily mean, J/m² → W/m²), 36-period stats (2013-2021), 0.25°"
    out = OUT_DIR / f"{name}_periods.nc"
    ds.to_netcdf(out)
    log(f"SAVED {out.name} ({out.stat().st_size / 1e6:.1f} MB) — total {time.time() - t_start:.0f}s")
    del ds, results
    gc.collect()


def process_diurnal_range():
    """Daily temperature range (max - min)."""
    name = "diurnal_range"
    print(f"\n{'='*60}\n  Processing: {name}\n{'='*60}")
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

        vals_c = (vals - 273.15).astype(np.float32)
        del vals
        gc.collect()

        daily_max = daily_agg_numpy(vals_c, "max")
        daily_min = daily_agg_numpy(vals_c, "min")
        daily_vals = (daily_max - daily_min).astype(np.float32)
        daily_t = daily_times_from_6h(times)
        daily_dom = get_day_of_month(daily_t)
        daily_years = get_years_from_times(daily_t)
        del vals_c, daily_max, daily_min, times, daily_t
        gc.collect()

        compute_sub_periods_threaded(daily_vals, month, daily_dom, daily_years, results)

        del daily_vals, daily_dom, daily_years
        gc.collect()
        log(f"  Month {month:02d} done in {time.time() - t0:.0f}s")

    ds = _build_dataset(results, lon_coords, lat_coords)
    ds.attrs["variable"] = name
    ds.attrs["units"] = "°C"
    ds.attrs["description"] = "Diurnal temperature range (daily max - min), 36-period stats (2013-2023), 0.25°"
    out = OUT_DIR / f"{name}_periods.nc"
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

    # --- Existing variables (use existing raw data) ---
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
    if not skip_if_done("cloud_cover"):
        process_simple_6h(
            "total_cloud_cover", "cloud_cover",
            units="fraction (0=clear, 1=overcast)",
            description="Total cloud cover, 36-period stats from 6h readings (2013-2023), 0.25°",
        )

    # --- Event-frequency variables (use existing raw data) ---
    if not skip_if_done("hot_days"):
        process_hot_days()
    if not skip_if_done("heavy_rain_days"):
        process_heavy_rain_days()
    if not skip_if_done("windy_days"):
        process_windy_days()

    # --- Derived variables (use existing raw data) ---
    if not skip_if_done("diurnal_range"):
        process_diurnal_range()

    # --- New variables requiring 2m_dewpoint_temperature download ---
    if not skip_if_done("dew_point"):
        process_dew_point()
    if not skip_if_done("relative_humidity"):
        process_relative_humidity()
    if not skip_if_done("apparent_temperature_day"):
        process_apparent_temperature("day")
    if not skip_if_done("apparent_temperature_night"):
        process_apparent_temperature("night")
    if not skip_if_done("muggy_days"):
        process_muggy_days()

    # --- New variables requiring radiation download ---
    if not skip_if_done("solar_radiation"):
        process_solar_radiation()

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
