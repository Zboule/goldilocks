"""
Generate uint8 land-only binary tiles from period NetCDF files for the web viewer.

Format:
  - Each .bin is a flat Uint8Array of length land_cells (~352K), not the full grid (1M)
  - land_index.bin maps each land cell to its position in the full grid (Uint32Array)
  - Encoding: 0=NaN, 1-255=value mapped to [encode_min, encode_max]
  - Client decodes: value = encode_min + ((uint8 - 1) / 254) * (encode_max - encode_min)

Tile size: ~344 KB raw, ~100 KB gzipped (vs 2 MB raw / 475 KB gzipped before)
Total dataset: ~78 MB gzipped (core stats) vs ~736 MB before

Reads:  data/processed/*_periods.nc
        Natural Earth 10m land polygons (auto-downloaded)

Writes: data/tiles/{variable}/{stat}/period{NN}.bin  (Uint8, land-only)
        data/tiles/land_index.bin                     (Uint32, grid indices of land cells)
        data/tiles/land_mask.bin                      (Float32, full grid, for legacy compat)
        data/tiles/manifest.json
"""

import xarray as xr
import numpy as np
import json
import time
import zipfile
import io
import requests
from pathlib import Path
from shapely.geometry import shape, box
from shapely import STRtree

PROCESSED_DIR = Path("data/processed")
TILES_DIR = Path("data/tiles")
NATURAL_EARTH_DIR = Path("data/natural_earth")
LAND_MASK_CACHE = NATURAL_EARTH_DIR / "land_mask_025.npy"

VARIABLES = {
    "temperature_day":            {"file": "temperature_day_periods.nc",            "units": "°C",       "label": "Day Temperature"},
    "temperature_night":          {"file": "temperature_night_periods.nc",          "units": "°C",       "label": "Night Temperature"},
    "apparent_temperature_day":   {"file": "apparent_temperature_day_periods.nc",   "units": "°C",       "label": "Feels Like – Day (BOM)"},
    "apparent_temperature_night": {"file": "apparent_temperature_night_periods.nc", "units": "°C",       "label": "Feels Like – Night (BOM)"},
    "dew_point":                  {"file": "dew_point_periods.nc",                  "units": "°C",       "label": "Dew Point"},
    "relative_humidity":          {"file": "relative_humidity_periods.nc",          "units": "%",        "label": "Relative Humidity"},
    "diurnal_range":              {"file": "diurnal_range_periods.nc",              "units": "°C",       "label": "Diurnal Range"},
    "wind_speed":                 {"file": "wind_speed_periods.nc",                 "units": "m/s",      "label": "Wind Speed"},
    "precipitation":              {"file": "precipitation_periods.nc",              "units": "mm/day",   "label": "Precipitation"},
    "rainy_hours":                {"file": "rainy_hours_periods.nc",               "units": "fraction", "label": "Rain Hours (All Day)"},
    "rainy_hours_day":            {"file": "rainy_hours_day_periods.nc",           "units": "fraction", "label": "Rain Hours (Daytime)"},
    "rainy_hours_night":          {"file": "rainy_hours_night_periods.nc",         "units": "fraction", "label": "Rain Hours (Nighttime)"},
    "solar_radiation":            {"file": "solar_radiation_periods.nc",            "units": "W/m²",     "label": "Sunshine Strength"},
    "cloud_cover":                {"file": "cloud_cover_periods.nc",                "units": "fraction", "label": "Cloud Cover"},
    "utci_day":                   {"file": "utci_day_periods.nc",                   "units": "°C",       "label": "Feels Like – Day (UTCI)"},
    "utci_night":                 {"file": "utci_night_periods.nc",                 "units": "°C",       "label": "Feels Like – Night (UTCI)"},
}

STATS = ["mean", "median", "min", "max", "p10", "p90", "ystd"]

GRID_WIDTH = 1440
GRID_HEIGHT = 601
RESOLUTION_DEG = 0.25


NATURAL_EARTH_URLS = {
    "land": "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip",
    "minor_islands": "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_minor_islands.zip",
}


def _download_and_extract_shapefile(name: str, url: str) -> Path:
    """Download a Natural Earth zip and extract to NATURAL_EARTH_DIR/{name}/."""
    extract_dir = NATURAL_EARTH_DIR / name
    shp_files = list(extract_dir.glob("*.shp"))
    if shp_files:
        return shp_files[0]

    print(f"  Downloading Natural Earth {name}...")
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()

    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        zf.extractall(extract_dir)

    shp_files = list(extract_dir.glob("*.shp"))
    if not shp_files:
        raise FileNotFoundError(f"No .shp file found in {url}")
    print(f"  Extracted: {shp_files[0]}")
    return shp_files[0]


def _load_shapefile_geometries(shp_path: Path) -> list:
    """Read geometries from a shapefile using only the standard library + shapely.

    Parses the .shp/.dbf binary format directly to avoid a heavy dependency
    on fiona or geopandas.
    """
    import struct

    geometries = []
    with open(shp_path, "rb") as f:
        # --- header (100 bytes) ---
        file_code = struct.unpack(">i", f.read(4))[0]
        if file_code != 9994:
            raise ValueError(f"Not a valid shapefile: {shp_path}")
        f.seek(24)
        file_length = struct.unpack(">i", f.read(4))[0] * 2  # in bytes
        version = struct.unpack("<i", f.read(4))[0]
        shape_type = struct.unpack("<i", f.read(4))[0]
        f.seek(100)

        # --- records ---
        while f.tell() < file_length:
            try:
                rec_num = struct.unpack(">i", f.read(4))[0]
                rec_len = struct.unpack(">i", f.read(4))[0] * 2
            except struct.error:
                break

            rec_data = f.read(rec_len)
            if len(rec_data) < 4:
                break

            rec_shape_type = struct.unpack("<i", rec_data[:4])[0]
            if rec_shape_type == 0:  # Null shape
                continue

            # Polygon (type 5) — the only type in Natural Earth land files
            if rec_shape_type == 5:
                bbox = struct.unpack("<4d", rec_data[4:36])
                num_parts = struct.unpack("<i", rec_data[36:40])[0]
                num_points = struct.unpack("<i", rec_data[40:44])[0]
                parts = list(struct.unpack(f"<{num_parts}i", rec_data[44:44 + num_parts * 4]))
                pts_offset = 44 + num_parts * 4
                points = []
                for p in range(num_points):
                    off = pts_offset + p * 16
                    x, y = struct.unpack("<2d", rec_data[off:off + 16])
                    points.append((x, y))

                # Build rings
                rings = []
                for r in range(num_parts):
                    start = parts[r]
                    end = parts[r + 1] if r + 1 < num_parts else num_points
                    rings.append(points[start:end])

                # Each ring may be a separate land mass (multi-part polygon).
                # Treat every ring as its own polygon -- safe for land masks.
                from shapely.geometry import Polygon as ShapelyPolygon
                for ring in rings:
                    try:
                        poly = ShapelyPolygon(ring)
                        if not poly.is_valid:
                            poly = poly.buffer(0)
                        if not poly.is_empty and poly.area > 0:
                            geometries.append(poly)
                    except Exception:
                        pass

    return geometries


def _rasterize_land_mask() -> np.ndarray:
    """Build a boolean land mask by checking Natural Earth polygon overlap per cell.

    For each 0.25° grid cell, if any land polygon intersects the cell rectangle,
    that cell is marked as land.  Uses an STRtree spatial index for speed.
    """
    # Download shapefiles
    all_geoms = []
    for name, url in NATURAL_EARTH_URLS.items():
        shp_path = _download_and_extract_shapefile(name, url)
        geoms = _load_shapefile_geometries(shp_path)
        print(f"  {name}: {len(geoms)} polygons")
        all_geoms.extend(geoms)

    print(f"  Total land polygons: {len(all_geoms)}")
    print(f"  Building spatial index...")
    tree = STRtree(all_geoms)

    mask = np.zeros((GRID_HEIGHT, GRID_WIDTH), dtype=bool)
    half = RESOLUTION_DEG / 2

    print(f"  Rasterizing {GRID_HEIGHT} x {GRID_WIDTH} grid...")
    t0 = time.time()

    for ilat in range(GRID_HEIGHT):
        lat = 90.0 - ilat * RESOLUTION_DEG
        if ilat % 100 == 0:
            elapsed = time.time() - t0
            print(f"    row {ilat}/{GRID_HEIGHT} ({elapsed:.1f}s)")

        lat_lo = lat - half
        lat_hi = lat + half

        for ilon in range(GRID_WIDTH):
            lon = ilon * RESOLUTION_DEG  # 0..359.75

            # Natural Earth uses -180..180, our grid uses 0..360
            lon_ne = lon - 360 if lon > 180 else lon
            cell = box(lon_ne - half, lat_lo, lon_ne + half, lat_hi)

            # Check if any land polygon intersects this cell
            hits = tree.query(cell, predicate="intersects")
            if len(hits) > 0:
                mask[ilat, ilon] = True

    elapsed = time.time() - t0
    print(f"  Rasterization done in {elapsed:.1f}s")
    print(f"  Land cells (raw): {mask.sum():,} / {mask.size:,}")

    # Patch: the ring parser treats shapefile holes (inland seas) as land.
    # Use pyshp + unary_union for a correct land geometry, then clear cells
    # whose center is not actually on land.
    try:
        import shapefile as pyshp
        from shapely.geometry import shape as shp_shape, Point
        from shapely.ops import unary_union as shp_union

        correct_polys = []
        for name, url in NATURAL_EARTH_URLS.items():
            shp_path = _download_and_extract_shapefile(name, url)
            sf = pyshp.Reader(str(shp_path))
            for s in sf.shapes():
                try:
                    g = shp_shape(s.__geo_interface__)
                    correct_polys.append(g if g.is_valid else g.buffer(0))
                except Exception:
                    pass
        correct_land = shp_union(correct_polys)

        cleared = 0
        for ilat in range(GRID_HEIGHT):
            lat = 90.0 - ilat * RESOLUTION_DEG
            for ilon in range(GRID_WIDTH):
                if not mask[ilat, ilon]:
                    continue
                lon = ilon * RESOLUTION_DEG
                lon_ne = lon - 360 if lon > 180 else lon
                if not correct_land.contains(Point(lon_ne, lat)):
                    cell = box(lon_ne - half, lat - half, lon_ne + half, lat + half)
                    if not correct_land.intersects(cell):
                        mask[ilat, ilon] = False
                        cleared += 1
        print(f"  Hole patch: cleared {cleared} inland-water cells")
    except Exception as e:
        print(f"  Warning: hole patch skipped ({e})")

    print(f"  Land cells (final): {mask.sum():,} / {mask.size:,}")
    return mask


def load_land_mask() -> np.ndarray:
    """Returns boolean mask (lat=601, lon=1440), True=land.

    Uses Natural Earth 10m land polygons (auto-downloaded) rasterized onto
    the 0.25° grid.  The result is cached to disk for fast re-runs.
    """
    if LAND_MASK_CACHE.exists():
        print(f"  Loading cached land mask: {LAND_MASK_CACHE}")
        return np.load(LAND_MASK_CACHE)

    mask = _rasterize_land_mask()

    LAND_MASK_CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.save(LAND_MASK_CACHE, mask)
    print(f"  Cached land mask to: {LAND_MASK_CACHE}")
    return mask


def encode_uint8(values: np.ndarray, enc_min: float, enc_max: float) -> np.ndarray:
    """Quantize float values to uint8 [1,255]. Input should be land-only (no NaN)."""
    if enc_max == enc_min:
        return np.full(values.shape, 128, dtype=np.uint8)
    normalized = np.clip((values - enc_min) / (enc_max - enc_min), 0.0, 1.0)
    return (normalized * 254 + 1).astype(np.uint8)


def main():
    t0 = time.time()
    print("=" * 60)
    print("  Tile Generator (0.25°, 36 periods, uint8 land-only)")
    print(f"  Grid: {GRID_WIDTH}x{GRID_HEIGHT} ({RESOLUTION_DEG}°)")
    print("  Land mask: Natural Earth 10m (land + minor islands)")
    print("=" * 60)

    land_mask = load_land_mask()

    print(f"  Land mask: {land_mask.shape}, land={land_mask.sum():,} / {land_mask.size:,}")

    # Build land index: flat indices of land cells in the full (lat, lon) grid
    land_index = np.where(land_mask.ravel())[0].astype(np.uint32)
    n_land = len(land_index)
    print(f"  Land cells: {n_land:,}")

    TILES_DIR.mkdir(parents=True, exist_ok=True)

    # Write land_bitmap.bin (1 bit per grid cell, ~127 KB)
    grid_size = GRID_HEIGHT * GRID_WIDTH
    bitmap = np.zeros(int(np.ceil(grid_size / 8)), dtype=np.uint8)
    flat_mask = land_mask.ravel()
    for i in range(grid_size):
        if flat_mask[i]:
            bitmap[i >> 3] |= (1 << (i & 7))
    bitmap.tofile(TILES_DIR / "land_bitmap.bin")
    print(f"  Saved land_bitmap.bin ({(TILES_DIR / 'land_bitmap.bin').stat().st_size / 1024:.0f} KB)")

    import hashlib
    data_version = hashlib.md5(f"{time.time()}".encode()).hexdigest()[:8]

    manifest = {
        "data_version": data_version,
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT, "resolution_deg": RESOLUTION_DEG},
        "lon_range": [0.0, 359.75],
        "lat_range": [90.0, -60.0],
        "periods": [],
        "period_labels": [],
        "stats": STATS,
        "encoding": "uint8-land-only",
        "land_cells": n_land,
        "chunk_size": 1024,
        "variable_order": list(VARIABLES.keys()),
        "variables": {},
    }

    total_files = 0
    var_order = list(VARIABLES.keys())
    cell_data = None
    
    for var_idx, (var_name, var_cfg) in enumerate(VARIABLES.items()):
        nc_path = PROCESSED_DIR / var_cfg["file"]
        if not nc_path.exists():
            print(f"\n  {var_name}: SKIP — {nc_path.name} not found (run process_periods_025.py first)")
            continue
        print(f"\n  {var_name}: reading {nc_path.name}...")
        ds = xr.open_dataset(nc_path)

        periods = ds.period.values.tolist()
        if not manifest["periods"]:
            manifest["periods"] = periods
            if "period_label" in ds:
                manifest["period_labels"] = ds["period_label"].values.tolist()
                
        if cell_data is None:
            cell_data = np.zeros((n_land, len(var_order), len(STATS), len(periods)), dtype=np.uint8)

        available_stats = [s for s in STATS if s in ds]
        if not available_stats:
            print(f"    WARNING: no stats found in {nc_path.name}, skipping")
            ds.close()
            continue

        # First pass: find global min/max across all stats and periods (land only)
        var_global_min = float("inf")
        var_global_max = float("-inf")
        mean_values_for_range = []

        for stat in available_stats:
            stat_data = ds[stat].values  # (period, lat/lon...)

            for pi in range(len(periods)):
                grid = stat_data[pi].copy()
                if grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T
                land_vals = grid.ravel()[land_index]
                valid = land_vals[~np.isnan(land_vals)]
                if len(valid) > 0:
                    var_global_min = min(var_global_min, float(valid.min()))
                    var_global_max = max(var_global_max, float(valid.max()))
                    if stat == "mean":
                        mean_values_for_range.extend(valid.tolist())

        if len(mean_values_for_range) == 0:
            print(f"    WARNING: no valid mean data for {var_name}, skipping")
            ds.close()
            continue

        enc_range = var_global_max - var_global_min
        enc_min = var_global_min - enc_range * 0.01
        enc_max = var_global_max + enc_range * 0.01

        all_means = np.array(mean_values_for_range)
        display_min = float(np.percentile(all_means, 2))
        display_max = float(np.percentile(all_means, 98))

        # Second pass: encode and write land-only uint8 tiles
        stat_index_map = {s: i for i, s in enumerate(STATS)}
        for stat in available_stats:
            stat_data = ds[stat].values
            global_stat_idx = stat_index_map[stat]

            for pi, period_num in enumerate(periods):
                grid = stat_data[pi].copy()
                if grid.shape[0] != GRID_HEIGHT:
                    grid = grid.T

                land_vals = grid.ravel()[land_index]
                nan_mask = np.isnan(land_vals)
                encoded = encode_uint8(np.nan_to_num(land_vals, nan=enc_min), enc_min, enc_max)
                encoded[nan_mask] = 0

                cell_data[:, var_idx, global_stat_idx, pi] = encoded

                out_path = TILES_DIR / var_name / stat / f"period{period_num:02d}.bin"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                encoded.tofile(out_path)
                total_files += 1

        manifest["variables"][var_name] = {
            "units": var_cfg["units"],
            "label": var_cfg["label"],
            "min": round(var_global_min, 2),
            "max": round(var_global_max, 2),
            "display_min": round(display_min, 2),
            "display_max": round(display_max, 2),
            "encode_min": round(enc_min, 4),
            "encode_max": round(enc_max, 4),
        }

        print(f"    {var_name}: {len(available_stats) * len(periods)} tiles, "
              f"range=[{var_global_min:.2f}, {var_global_max:.2f}], "
              f"encode=[{enc_min:.2f}, {enc_max:.2f}] {var_cfg['units']}")
        ds.close()

    print("\n  Writing per-period cell chunks for tooltips...")
    import math
    chunk_size = manifest["chunk_size"]
    chunks_dir = TILES_DIR / "cell_chunks"
    num_chunks = math.ceil(n_land / chunk_size)
    n_periods = cell_data.shape[3] if cell_data is not None else 0
    chunk_files_written = 0

    for pi in range(n_periods):
        period_dir = chunks_dir / f"period{pi + 1:02d}"
        period_dir.mkdir(parents=True, exist_ok=True)
        for c in range(num_chunks):
            start = c * chunk_size
            end = min(n_land, start + chunk_size)
            # (cells_in_chunk, n_vars, n_stats) for this one period
            chunk_slice = cell_data[start:end, :, :, pi]
            chunk_slice.tofile(period_dir / f"chunk_{c:04d}.bin")
            chunk_files_written += 1

    total_files += chunk_files_written
    print(f"  Wrote {chunk_files_written} chunk files ({n_periods} periods × {num_chunks} chunks, ~{chunk_size * len(var_order) * len(STATS) / 1024:.0f} KB each)")

    manifest_path = TILES_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    total_size = sum(f.stat().st_size for f in TILES_DIR.rglob("*.bin"))
    elapsed = time.time() - t0

    print(f"\n{'=' * 60}")
    print(f"  Done in {elapsed:.0f}s")
    print(f"  Total: {total_files} tiles + land_index.bin + manifest.json")
    print(f"  Size:  {total_size / 1e6:.1f} MB ({total_size / total_files / 1024:.0f} KB avg/tile)")
    print(f"  Land cells: {n_land:,} ({n_land * 1 / 1024:.0f} KB per tile)")
    print("=" * 60)


if __name__ == "__main__":
    main()
