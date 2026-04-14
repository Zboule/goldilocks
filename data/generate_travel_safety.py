"""
Generate travel safety tiles, country index, and country lookup from
three advisory sources: US State Dept, Germany (Auswärtiges Amt), Canada.

The composite "Goldilocks" level is the average of available sources (rounded).

Outputs:
  - data/tiles/travel_safety/{stat}/period{NN}.bin  (uint8 land-only, composite level)
  - data/tiles/country_index.bin                     (uint8 per land cell -> country lookup index)
  - data/tiles/country_lookup.json                   (array: index -> country + per-source advisories)
  - Updates data/tiles/manifest.json                 (adds travel_safety variable)

Reads:
  - data/us_travel_advisories.csv
  - Germany API: https://www.auswaertiges-amt.de/opendata/travelwarning
  - Canada API: https://data.international.gc.ca/travel-voyage/index-alpha-eng.json
  - data/natural_earth/land_mask_025.npy (from generate_tiles_025.py)
  - Natural Earth 10m admin-0 countries (auto-downloaded)
"""

import csv
import json
import math
import re
import struct
import time
import zipfile
import io
import numpy as np
import requests
from pathlib import Path
from shapely.geometry import Point, box
from shapely import STRtree

TILES_DIR = Path("data/tiles")
NATURAL_EARTH_DIR = Path("data/natural_earth")
ADVISORY_CSV = Path("data/us_travel_advisories.csv")
LAND_MASK_CACHE = NATURAL_EARTH_DIR / "land_mask_025.npy"

GRID_WIDTH = 1440
GRID_HEIGHT = 721
RESOLUTION_DEG = 0.25

COUNTRIES_URL = "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip"
COUNTRIES_DIR = NATURAL_EARTH_DIR / "admin_0_countries"

STATS = ["mean", "median", "min", "max", "p10", "p90", "ystd"]

# Shapefile ISO codes that differ from standard ISO A2
SHAPEFILE_ISO_FIXES = {
    "CN-TW": "TW",  # Natural Earth marks Taiwan as CN-TW
}

US_LEVEL_LABELS = {
    1: "Exercise Normal Precautions",
    2: "Exercise Increased Caution",
    3: "Reconsider Travel",
    4: "Do Not Travel",
}

DE_LEVEL_LABELS = {
    1: "Keine Reisewarnung",
    2: "Sicherheitshinweise (Teile)",
    3: "Teilreisewarnung",
    4: "Reisewarnung",
}

CA_LEVEL_LABELS = {
    1: "Take Normal Precautions",
    2: "Exercise High Degree of Caution",
    3: "Avoid Non-Essential Travel",
    4: "Avoid All Travel",
}


# ---------------------------------------------------------------------------
# Data source fetchers
# ---------------------------------------------------------------------------

def load_us_advisories() -> dict:
    """Load US State Dept advisories from CSV -> {iso_a2: {level, label, url}}."""
    advisories = {}
    with open(ADVISORY_CSV) as f:
        for row in csv.DictReader(f):
            advisories[row["iso_a2"]] = {
                "level": int(row["level"]),
                "label": row["label"],
                "url": row["advisory_url"],
            }
    return advisories


def fetch_germany_advisories() -> dict:
    """Fetch German Auswärtiges Amt advisories -> {iso_a2: {level, label, url}}."""
    print("  Fetching Germany (Auswärtiges Amt) advisories...")
    resp = requests.get("https://www.auswaertiges-amt.de/opendata/travelwarning", timeout=30)
    resp.raise_for_status()
    data = resp.json()["response"]

    advisories = {}
    for key, entry in data.items():
        if key == "lastModified" or not isinstance(entry, dict):
            continue

        iso = entry.get("countryCode", "")
        if not iso or len(iso) != 2:
            continue

        warning = entry.get("warning", False)
        partial_warning = entry.get("partialWarning", False)
        situation_warning = entry.get("situationWarning", False)
        situation_part_warning = entry.get("situationPartWarning", False)

        if warning:
            level = 4
        elif situation_warning:
            level = 3
        elif partial_warning or situation_part_warning:
            level = 2
        else:
            level = 1

        url = f"https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/{key}"
        advisories[iso] = {
            "level": level,
            "label": DE_LEVEL_LABELS.get(level, ""),
            "url": url,
        }

    print(f"    {len(advisories)} countries")
    return advisories


def fetch_canada_advisories() -> dict:
    """Fetch Canada travel advisories -> {iso_a2: {level, label, url}}."""
    print("  Fetching Canada (Global Affairs) advisories...")
    resp = requests.get("https://data.international.gc.ca/travel-voyage/index-alpha-eng.json", timeout=30)
    resp.raise_for_status()
    data = resp.json()["data"]

    advisories = {}
    for iso, info in data.items():
        if len(iso) != 2:
            continue

        # Canada uses 0-3 scale: 0=normal, 1=caution, 2=avoid non-essential, 3=avoid all
        ca_state = info.get("advisory-state", 0)
        level = ca_state + 1  # map to 1-4

        slug = info.get("country-eng", iso).lower().replace(" ", "-")
        url = f"https://travel.gc.ca/destinations/{slug}"

        advisories[iso] = {
            "level": level,
            "label": CA_LEVEL_LABELS.get(level, ""),
            "url": url,
        }

    print(f"    {len(advisories)} countries")
    return advisories


def compute_composite(us_adv, de_adv, ca_adv, iso):
    """Compute Goldilocks composite level: worst (max) of available sources."""
    levels = []
    if iso in us_adv and us_adv[iso]["level"] > 0:
        levels.append(us_adv[iso]["level"])
    if iso in de_adv and de_adv[iso]["level"] > 0:
        levels.append(de_adv[iso]["level"])
    if iso in ca_adv and ca_adv[iso]["level"] > 0:
        levels.append(ca_adv[iso]["level"])

    if not levels:
        return 0
    return max(levels)


# ---------------------------------------------------------------------------
# Shapefile parsing (unchanged)
# ---------------------------------------------------------------------------

def download_and_extract_countries() -> Path:
    shp_files = list(COUNTRIES_DIR.glob("*.shp"))
    if shp_files:
        return shp_files[0]
    print("  Downloading Natural Earth admin-0 countries...")
    resp = requests.get(COUNTRIES_URL, timeout=120)
    resp.raise_for_status()
    COUNTRIES_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        zf.extractall(COUNTRIES_DIR)
    shp_files = list(COUNTRIES_DIR.glob("*.shp"))
    if not shp_files:
        raise FileNotFoundError("No .shp file found after extraction")
    print(f"  Extracted: {shp_files[0]}")
    return shp_files[0]


def parse_dbf(dbf_path: Path) -> list[dict]:
    records = []
    with open(dbf_path, "rb") as f:
        struct.unpack("<B", f.read(1))
        f.read(3)
        num_records = struct.unpack("<I", f.read(4))[0]
        header_size = struct.unpack("<H", f.read(2))[0]
        struct.unpack("<H", f.read(2))
        f.read(20)

        fields = []
        while True:
            peek = f.read(1)
            if peek == b"\r":
                break
            name = (peek + f.read(10)).split(b"\x00")[0].decode("ascii")
            field_type = f.read(1).decode("ascii")
            f.read(4)
            field_len = struct.unpack("<B", f.read(1))[0]
            struct.unpack("<B", f.read(1))
            f.read(14)
            fields.append((name, field_type, field_len))

        f.seek(header_size)
        for _ in range(num_records):
            f.read(1)
            rec = {}
            for name, field_type, field_len in fields:
                raw = f.read(field_len)
                val = raw.decode("latin-1").strip().strip("\x00")
                if field_type == "N":
                    try:
                        val = int(val) if "." not in val else float(val)
                    except ValueError:
                        val = None
                rec[name] = val
            records.append(rec)
    return records


def load_shapefile_geometries_with_attrs(shp_path: Path) -> list[tuple]:
    from shapely.geometry import Polygon as ShapelyPolygon

    dbf_path = shp_path.with_suffix(".dbf")
    records = parse_dbf(dbf_path)

    geometries = []
    with open(shp_path, "rb") as f:
        file_code = struct.unpack(">i", f.read(4))[0]
        if file_code != 9994:
            raise ValueError(f"Not a valid shapefile: {shp_path}")
        f.seek(24)
        file_length = struct.unpack(">i", f.read(4))[0] * 2
        f.read(4)
        f.read(4)
        f.seek(100)

        rec_idx = 0
        while f.tell() < file_length:
            try:
                struct.unpack(">i", f.read(4))
                rec_len = struct.unpack(">i", f.read(4))[0] * 2
            except struct.error:
                break
            rec_data = f.read(rec_len)
            if len(rec_data) < 4:
                break
            rec_shape_type = struct.unpack("<i", rec_data[:4])[0]
            if rec_shape_type == 0:
                rec_idx += 1
                continue
            if rec_shape_type == 5:
                num_parts = struct.unpack("<i", rec_data[36:40])[0]
                num_points = struct.unpack("<i", rec_data[40:44])[0]
                parts = list(struct.unpack(f"<{num_parts}i", rec_data[44:44 + num_parts * 4]))
                pts_offset = 44 + num_parts * 4
                points = []
                for p in range(num_points):
                    off = pts_offset + p * 16
                    x, y = struct.unpack("<2d", rec_data[off:off + 16])
                    points.append((x, y))
                for r in range(num_parts):
                    start = parts[r]
                    end = parts[r + 1] if r + 1 < num_parts else num_points
                    ring = points[start:end]
                    try:
                        poly = ShapelyPolygon(ring)
                        if not poly.is_valid:
                            poly = poly.buffer(0)
                        if not poly.is_empty and poly.area > 0:
                            geometries.append((poly, rec_idx))
                    except Exception:
                        pass
            rec_idx += 1

    country_geoms = []
    for geom, ridx in geometries:
        if ridx < len(records):
            rec = records[ridx]
            iso = rec.get("ISO_A2") or rec.get("iso_a2") or ""
            name = rec.get("NAME") or rec.get("name") or ""
            if iso == "-99" or not iso:
                iso = rec.get("ISO_A2_EH") or ""
            if iso == "-99" or not iso:
                adm = rec.get("ADM0_A3") or ""
                if len(adm) >= 2:
                    iso = adm[:2]
            # Fix known shapefile ISO mismatches
            iso = SHAPEFILE_ISO_FIXES.get(iso, iso)
            country_geoms.append((geom, iso, name))

    return country_geoms


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()
    print("=" * 60)
    print("  Travel Safety Tile Generator (Goldilocks Composite)")
    print("  Sources: US State Dept + Germany + Canada")
    print("=" * 60)

    if not LAND_MASK_CACHE.exists():
        print("ERROR: Run generate_tiles_025.py first to create land mask")
        return
    land_mask = np.load(LAND_MASK_CACHE)
    land_index = np.where(land_mask.ravel())[0].astype(np.uint32)
    n_land = len(land_index)
    print(f"  Land cells: {n_land:,}")

    # Fetch all three advisory sources
    us_adv = load_us_advisories()
    print(f"  US advisories: {len(us_adv)}")
    de_adv = fetch_germany_advisories()
    ca_adv = fetch_canada_advisories()

    # Download and parse country polygons
    shp_path = download_and_extract_countries()
    country_geoms = load_shapefile_geometries_with_attrs(shp_path)
    print(f"  Country geometry parts: {len(country_geoms)}")

    unique_isos = set(iso for _, iso, _ in country_geoms if iso)
    print(f"  Unique country codes in shapefile: {len(unique_isos)}")

    iso_list = sorted(unique_isos)
    iso_to_idx = {iso: i + 1 for i, iso in enumerate(iso_list)}

    # Fetch clean English names from Canada API (best coverage)
    ca_names = {}
    try:
        resp = requests.get("https://data.international.gc.ca/travel-voyage/index-alpha-eng.json", timeout=10)
        for iso_key, info in resp.json()["data"].items():
            ca_names[iso_key] = info.get("country-eng", "")
    except Exception:
        pass

    # Build country lookup with all three sources
    country_lookup = [None]
    for iso in iso_list:
        names_for_iso = [name for _, i, name in country_geoms if i == iso and name]
        shp_name = names_for_iso[0] if names_for_iso else iso

        # Prefer: US advisory name > Canada name > shapefile name
        display_name = shp_name
        if iso in ca_names and ca_names[iso]:
            display_name = ca_names[iso]
        if iso in us_adv and us_adv[iso].get("name"):
            display_name = us_adv[iso]["name"]

        composite = compute_composite(us_adv, de_adv, ca_adv, iso)

        entry = {
            "iso_a2": iso,
            "name": display_name,
            "level": composite,
            "sources": {},
        }

        if iso in us_adv:
            entry["sources"]["us"] = {
                "level": us_adv[iso]["level"],
                "label": us_adv[iso]["label"],
                "url": us_adv[iso]["url"],
            }
        if iso in de_adv:
            entry["sources"]["de"] = {
                "level": de_adv[iso]["level"],
                "label": de_adv[iso]["label"],
                "url": de_adv[iso]["url"],
            }
        if iso in ca_adv:
            entry["sources"]["ca"] = {
                "level": ca_adv[iso]["level"],
                "label": ca_adv[iso]["label"],
                "url": ca_adv[iso]["url"],
            }

        country_lookup.append(entry)

    # Build spatial index
    geom_list = [g for g, _, _ in country_geoms]
    iso_codes = [iso for _, iso, _ in country_geoms]
    tree = STRtree(geom_list)

    print("  Spatial index built")
    print("  Assigning countries to land cells...")

    half = RESOLUTION_DEG / 2
    risk_array = np.zeros(n_land, dtype=np.uint8)
    country_idx_array = np.zeros(n_land, dtype=np.uint8)

    t_assign = time.time()
    for li in range(n_land):
        if li % 50000 == 0:
            elapsed = time.time() - t_assign
            print(f"    cell {li:,}/{n_land:,} ({elapsed:.1f}s)")

        grid_idx = land_index[li]
        lat_idx = grid_idx // GRID_WIDTH
        lon_idx = grid_idx % GRID_WIDTH
        lon = lon_idx * RESOLUTION_DEG
        if lon > 180:
            lon -= 360
        lat = 90.0 - lat_idx * RESOLUTION_DEG

        centroid = Point(lon, lat)
        hits = tree.query(centroid, predicate="intersects")

        best_iso = ""
        if len(hits) > 0:
            best_iso = iso_codes[hits[0]]

        if not best_iso:
            cell = box(lon - half, lat - half, lon + half, lat + half)
            hits = tree.query(cell, predicate="intersects")
            if len(hits) > 0:
                best_iso = iso_codes[hits[0]]

        # Composite risk for primary country
        max_risk = compute_composite(us_adv, de_adv, ca_adv, best_iso) if best_iso else 0

        # For border cells, take max composite risk among all overlapping countries
        if len(hits) > 1:
            for h in hits:
                h_iso = iso_codes[h]
                h_level = compute_composite(us_adv, de_adv, ca_adv, h_iso)
                if h_level > max_risk:
                    max_risk = h_level

        if best_iso and best_iso in iso_to_idx:
            country_idx_array[li] = iso_to_idx[best_iso]

        if max_risk > 0:
            risk_array[li] = max_risk

    elapsed_assign = time.time() - t_assign
    print(f"  Assignment done in {elapsed_assign:.1f}s")

    assigned_before = int(np.count_nonzero(country_idx_array))
    print(f"  Cells with country: {assigned_before:,}/{n_land:,} ({100*assigned_before/n_land:.1f}%)")

    # Fallback: expand search for unassigned cells
    unassigned_indices = [li for li in range(n_land) if country_idx_array[li] == 0]
    print(f"  Running nearest-country fallback for {len(unassigned_indices)} unassigned cells...")
    SEARCH_RADII = [0.5, 1.0, 2.0, 4.0]
    resolved = 0
    for li in unassigned_indices:
        grid_idx = land_index[li]
        lat_idx = grid_idx // GRID_WIDTH
        lon_idx = grid_idx % GRID_WIDTH
        lon = lon_idx * RESOLUTION_DEG
        if lon > 180:
            lon -= 360
        lat = 90.0 - lat_idx * RESOLUTION_DEG

        for radius in SEARCH_RADII:
            expanded = box(lon - radius, lat - radius, lon + radius, lat + radius)
            hits = tree.query(expanded, predicate="intersects")
            if len(hits) > 0:
                best_dist = float("inf")
                nearest_iso = iso_codes[hits[0]]
                centroid = Point(lon, lat)
                for h in hits:
                    d = geom_list[h].distance(centroid)
                    if d < best_dist:
                        best_dist = d
                        nearest_iso = iso_codes[h]
                if nearest_iso and nearest_iso in iso_to_idx:
                    country_idx_array[li] = iso_to_idx[nearest_iso]
                    cr = compute_composite(us_adv, de_adv, ca_adv, nearest_iso)
                    if cr > 0:
                        risk_array[li] = cr
                    resolved += 1
                break

    print(f"  Fallback resolved {resolved}/{len(unassigned_indices)} cells")
    assigned = int(np.count_nonzero(country_idx_array))
    print(f"  Cells with country: {assigned:,}/{n_land:,} ({100*assigned/n_land:.1f}%)")

    risk_counts = {i: int(np.sum(risk_array == i)) for i in range(5)}
    print(f"  Risk distribution: {risk_counts}")

    # Encode risk level for tiles
    enc_min = 0.5
    enc_max = 4.5
    encoded_risk = np.zeros(n_land, dtype=np.uint8)
    for li in range(n_land):
        if risk_array[li] == 0:
            encoded_risk[li] = 0
        else:
            normalized = (risk_array[li] - enc_min) / (enc_max - enc_min)
            encoded_risk[li] = int(normalized * 254 + 1)

    # Load manifest
    manifest_path = TILES_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    periods = manifest["periods"]
    print(f"  Periods: {len(periods)}")

    # Write risk tiles
    tiles_written = 0
    for stat in STATS:
        for period_num in periods:
            out_path = TILES_DIR / "travel_safety" / stat / f"period{period_num:02d}.bin"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            encoded_risk.tofile(out_path)
            tiles_written += 1
    print(f"  Written {tiles_written} risk tiles")

    # Write country_index.bin
    country_idx_path = TILES_DIR / "country_index.bin"
    country_idx_array.tofile(country_idx_path)
    print(f"  Written country_index.bin ({country_idx_path.stat().st_size / 1024:.0f} KB)")

    # Write country_lookup.json
    lookup_path = TILES_DIR / "country_lookup.json"
    lookup_path.write_text(json.dumps(country_lookup, indent=None, separators=(",", ":")))
    print(f"  Written country_lookup.json ({lookup_path.stat().st_size / 1024:.0f} KB)")

    # Update manifest
    manifest["variables"]["travel_safety"] = {
        "units": "level",
        "label": "Travel Safety (Goldilocks)",
        "min": 1,
        "max": 4,
        "display_min": 1,
        "display_max": 4,
        "encode_min": enc_min,
        "encode_max": enc_max,
        "categorical": True,
    }

    if "travel_safety" not in (manifest.get("variable_order") or []):
        manifest.setdefault("variable_order", []).append("travel_safety")

    manifest_path.write_text(json.dumps(manifest, indent=2))
    print("  Updated manifest.json")

    # Rebuild cell_chunks
    chunk_size = manifest.get("chunk_size", 1024)
    var_order = manifest.get("variable_order", [])
    n_vars = len(var_order)
    n_stats = len(STATS)
    safety_var_idx = var_order.index("travel_safety")
    old_n_vars = n_vars - 1
    n_periods = len(periods)
    num_chunks = math.ceil(n_land / chunk_size)
    old_cell_stride = old_n_vars * n_stats
    new_cell_stride = n_vars * n_stats

    print(f"  Rebuilding {num_chunks * n_periods} cell chunks (stride {old_cell_stride} -> {new_cell_stride})...")
    chunks_dir = TILES_DIR / "cell_chunks"
    chunks_updated = 0

    for pi in range(n_periods):
        period_num = periods[pi]
        period_dir = chunks_dir / f"period{period_num:02d}"
        if not period_dir.exists():
            continue
        for c in range(num_chunks):
            chunk_path = period_dir / f"chunk_{c:04d}.bin"
            if not chunk_path.exists():
                continue
            old_data = np.frombuffer(chunk_path.read_bytes(), dtype=np.uint8)
            cells_in_chunk = min(chunk_size, n_land - c * chunk_size)
            new_data = np.zeros(cells_in_chunk * new_cell_stride, dtype=np.uint8)
            for ci in range(cells_in_chunk):
                old_off = ci * old_cell_stride
                new_off = ci * new_cell_stride
                old_end = old_off + old_cell_stride
                if old_end <= len(old_data):
                    new_data[new_off:new_off + old_cell_stride] = old_data[old_off:old_end]
                land_idx = c * chunk_size + ci
                val = encoded_risk[land_idx]
                safety_off = new_off + safety_var_idx * n_stats
                new_data[safety_off:safety_off + n_stats] = val
            new_data.tofile(chunk_path)
            chunks_updated += 1

    print(f"  Rebuilt {chunks_updated} chunks")

    # Summary: show per-source coverage
    print(f"\n  Coverage summary:")
    print(f"    US: {len(us_adv)} countries")
    print(f"    Germany: {len(de_adv)} countries")
    print(f"    Canada: {len(ca_adv)} countries")
    all_isos = set(us_adv) | set(de_adv) | set(ca_adv)
    covered_by_all = set(us_adv) & set(de_adv) & set(ca_adv)
    print(f"    Any source: {len(all_isos)} countries")
    print(f"    All 3 sources: {len(covered_by_all)} countries")

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"  Done in {elapsed:.0f}s")
    print(f"  Risk tiles: {tiles_written}")
    print(f"  Country lookup: {len(country_lookup) - 1} countries")
    print("=" * 60)


if __name__ == "__main__":
    main()
