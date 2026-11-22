#!/usr/bin/env bash
# Hosting predeploy guard: refuse to ship the map without its self-hosted basemap and fonts (they're not in git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
missing=0
[ -s "$ROOT/web/public/tiles/nyc.pmtiles" ] || { echo "missing web/public/tiles/nyc.pmtiles"; missing=1; }
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  [ -s "$ROOT/web/public/fonts/$f/0-255.pbf" ] || { echo "missing fonts: $f"; missing=1; }
done
if [ "$missing" -ne 0 ]; then echo "Run tools/make_basemap.sh first."; exit 1; fi
echo "map files present"
