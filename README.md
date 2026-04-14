# Goldilocks

Global climate explorer — find the places on Earth with *just right* weather for any time of the year.

Built on [ERA5 reanalysis data](https://cds.climate.copernicus.eu/) at 0.25° resolution (1440×721 grid), visualised with deck.gl and MapLibre.

## Quick start

```bash
git clone git@github.com:Zboule/goldilocks.git
cd goldilocks
./setup.sh        # downloads tiles, installs deps
cd ui && pnpm dev
```

> `setup.sh` requires the [GitHub CLI](https://cli.github.com/) (`gh`) to download tile data from the release artifacts.

## Manual setup

If you prefer to set things up step by step:

```bash
# 1. Download and extract pre-built tiles
gh release download v2.2.1 --repo Zboule/goldilocks --pattern "tiles-*.tar.gz" --dir /tmp
tar -xzf /tmp/tiles-v2.2.1.tar.gz -C data/

# 2. Ensure the UI symlink exists
ln -s ../../data/tiles ui/public/tiles

# 3. Install UI dependencies and start
cd ui
pnpm install
pnpm dev
```

## Data

- **Source:** ERA5 reanalysis from [WeatherBench2](https://weatherbench2.readthedocs.io/) (2013–2023)
- **Resolution:** 0.25° (~28 km at the equator)
- **Time periods:** 36 per year — Early/Mid/Late for each month (days 1–10, 11–20, 21–end)
- **Variables (16):**
  - *Temperature:* Day temperature, Night temperature, Apparent temperature day (BOM), Apparent temperature night (BOM), Diurnal range
  - *Humidity:* Dew point, Relative humidity
  - *Wind:* Wind speed
  - *Precipitation:* Precipitation, Cloud cover, Solar radiation
  - *Event frequencies (year-normalized):* Rainy days, Heavy rain days, Muggy days, Hot days, Windy days
- **Stats per cell per period (7):** Mean, Median, Min, Max, P10, P90, Ystd (interannual standard deviation)
- **Tile format:** uint8 land-only (~344 KB/tile raw, ~100 KB gzipped), ocean cells excluded via land index

## Regenerating tiles from source

To rebuild the tile data from ERA5 (downloads ~420 GB of raw data):

```bash
python -m venv .venv && .venv/bin/pip install -r data/requirements.txt

.venv/bin/python data/download_era5_025.py       # download 0.25° raw ERA5 data (~420 GB, 7 variables)
.venv/bin/python data/process_periods_025.py     # aggregate into 36-period stats (~16 GB, 16 variables × 7 stats)
.venv/bin/python data/generate_tiles_025.py      # produce uint8 land-only tiles (~130 MB gzipped)
```

## Uploading new tiles

After regenerating tiles, create a new release:

```bash
tar -czf tiles-v2.2.1.tar.gz -C data tiles/
gh release create v2.2.1 tiles-v2.2.1.tar.gz --repo Zboule/goldilocks \
  --title "v2.2.1 – 0.25° 36-period uint8 tiles" \
  --notes "0.25° resolution, 36 periods, uint8 land-only, 16 variables, 7 stats"
```

## Project structure

```
goldilocks/
├── data/                           # Data pipeline (Python)
│   ├── download_era5_025.py        # ERA5 0.25° data download
│   ├── process_periods_025.py      # 36-period aggregation
│   ├── generate_tiles_025.py       # uint8 land-only binary tile generation
│   ├── requirements.txt            # Python dependencies
│   └── tiles/                      # Generated tiles (gitignored)
├── ui/                             # Web UI (React + TypeScript)
│   ├── public/tiles -> ../../data/tiles
│   └── src/
├── setup.sh                        # One-command setup
└── README.md
```
