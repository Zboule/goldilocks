#!/usr/bin/env bash
set -euo pipefail

REPO="Zboule/goldilocks"
TAG="v2.2.0"
TILES_DIR="data/tiles"
SYMLINK="ui/public/tiles"

if [ -d "$TILES_DIR" ] && [ "$(ls -A "$TILES_DIR" 2>/dev/null)" ]; then
  echo "✓ Tiles already present in $TILES_DIR"
else
  echo "Downloading tiles from GitHub release $TAG ..."
  gh release download "$TAG" --repo "$REPO" --pattern "tiles-*.tar.gz" --dir /tmp --clobber
  echo "Extracting tiles ..."
  mkdir -p data
  tar -xzf /tmp/tiles-"$TAG".tar.gz -C data/
  rm /tmp/tiles-"$TAG".tar.gz
  echo "✓ Tiles extracted to $TILES_DIR"
fi

if [ ! -L "$SYMLINK" ]; then
  echo "Creating symlink $SYMLINK -> ../../data/tiles ..."
  ln -s ../../data/tiles "$SYMLINK"
  echo "✓ Symlink created"
else
  echo "✓ Symlink $SYMLINK already exists"
fi

echo ""
echo "Installing UI dependencies ..."
cd ui && pnpm install
echo ""
echo "✓ Setup complete! Run 'cd ui && pnpm dev' to start."
