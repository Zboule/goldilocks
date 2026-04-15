#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

VERSION=$(python -c "import json; print(json.load(open('data/tiles/manifest.json')).get('data_version','unknown'))")
RELEASE_DIR="release-${VERSION}"
mkdir -p "$RELEASE_DIR"

echo "============================================"
echo "  Packaging release: ${VERSION}"
echo "============================================"

# --- Archive 1: tiles (changes every data rebuild) ---
echo ""
echo ">>> Packaging tiles..."
tar czf "${RELEASE_DIR}/tiles-${VERSION}.tar.gz" \
  -C data/tiles \
  --exclude='*.log' \
  --exclude='tile_shapes.bin' \
  .

TILES_SIZE=$(du -sh "${RELEASE_DIR}/tiles-${VERSION}.tar.gz" | cut -f1)
echo "  tiles-${VERSION}.tar.gz: ${TILES_SIZE}"

# --- Archive 2: static assets (rarely change, needed by other hosts) ---
echo ""
echo ">>> Packaging static assets..."
tar czf "${RELEASE_DIR}/static-assets.tar.gz" \
  data/tiles/tile_shapes.bin \
  data/natural_earth/land/ne_10m_land.shp \
  data/natural_earth/land/ne_10m_land.shx \
  data/natural_earth/land/ne_10m_land.dbf \
  data/natural_earth/land/ne_10m_land.prj \
  data/natural_earth/minor_islands/ne_10m_minor_islands.shp \
  data/natural_earth/minor_islands/ne_10m_minor_islands.shx \
  data/natural_earth/minor_islands/ne_10m_minor_islands.dbf \
  data/natural_earth/minor_islands/ne_10m_minor_islands.prj \
  data/natural_earth/admin_0_countries/ne_10m_admin_0_countries.shp \
  data/natural_earth/admin_0_countries/ne_10m_admin_0_countries.shx \
  data/natural_earth/admin_0_countries/ne_10m_admin_0_countries.dbf \
  data/natural_earth/admin_0_countries/ne_10m_admin_0_countries.prj \
  2>/dev/null || true

STATIC_SIZE=$(du -sh "${RELEASE_DIR}/static-assets.tar.gz" | cut -f1)
echo "  static-assets.tar.gz: ${STATIC_SIZE}"

# --- Summary ---
echo ""
echo "============================================"
echo "  Release ${VERSION} packaged in ${RELEASE_DIR}/"
echo ""
echo "  tiles-${VERSION}.tar.gz     ${TILES_SIZE}  (deploy to web server)"
echo "  static-assets.tar.gz        ${STATIC_SIZE}  (copy to compute hosts)"
echo ""
echo "  Contents of static-assets:"
echo "    tile_shapes.bin        - coastline-clipped cell polygons"
echo "    natural_earth/         - NE 10m shapefiles (land, islands, countries)"
echo "============================================"
