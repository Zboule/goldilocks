# Goldilocks

Global climate explorer — find the places on Earth with *just right* weather for any week of the year.

Built on [ERA5 reanalysis data](https://cds.climate.copernicus.eu/) at 0.5° resolution, visualised with deck.gl and MapLibre.

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
gh release download v1.0.0 --repo Zboule/goldilocks --pattern "tiles-*.tar.gz" --dir /tmp
tar -xzf /tmp/tiles-v1.0.0.tar.gz -C data/

# 2. Ensure the UI symlink exists
ln -s ../../data/tiles ui/public/tiles

# 3. Install UI dependencies and start
cd ui
pnpm install
pnpm dev
```

## Regenerating tiles from source

To rebuild the tile data from ERA5 (requires a CDS API key):

```bash
cd data
pip install -r requirements.txt
python download_era5.py       # download raw ERA5 data
python process_weekly.py      # aggregate into weekly stats
python generate_tiles.py      # produce binary tiles for the UI
```

## Uploading new tiles

After regenerating tiles, update the release artifact:

```bash
tar -czf /tmp/tiles-v1.0.0.tar.gz -C data tiles/
gh release upload v1.0.0 /tmp/tiles-v1.0.0.tar.gz --repo Zboule/goldilocks --clobber
```

## Project structure

```
goldilocks/
├── data/                  # Data pipeline (Python)
│   ├── download_era5.py   # ERA5 data download
│   ├── process_weekly.py  # Weekly aggregation
│   ├── generate_tiles.py  # Binary tile generation
│   └── tiles/             # Generated tiles (gitignored)
├── ui/                    # Web UI (React + TypeScript)
│   ├── public/tiles -> ../../data/tiles
│   └── src/
├── setup.sh               # One-command setup
└── README.md
```
