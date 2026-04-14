#!/usr/bin/env bash
set -e
cd /home/jordanecure/dev/goldilocks
PYTHON=.venv/bin/python

echo "============================================"
echo "  Goldilocks data pipeline"
echo "  Started: $(date)"
echo "============================================"

echo ""
echo ">>> Step 1: Download new ERA5 variables (RH 1000hPa + TOA solar)"
$PYTHON data/download_era5_025.py 2>&1

echo ""
echo ">>> Step 2: Process remaining variables"
$PYTHON data/process_periods_025.py 2>&1

echo ""
echo ">>> Step 3: Generate tiles"
$PYTHON data/generate_tiles_025.py 2>&1

echo ""
echo "============================================"
echo "  Pipeline complete at $(date)"
echo "============================================"
