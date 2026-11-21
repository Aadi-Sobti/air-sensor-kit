#!/usr/bin/env bash
# Builds the self-hosted NYC basemap (decision #9: MapLibre + PMTiles on our own Hosting).
# Source: Protomaps daily build (OpenStreetMap data, ODbL: the map must show "© OpenStreetMap").
# Docs: https://docs.protomaps.com/pmtiles/cli . Needs the pmtiles CLI (brew install pmtiles).
# The output (~36 MB) is NOT committed; it is copied into the site at build time (web/public/tiles/).
set -euo pipefail
BUILD="${1:-$(date -u +%Y%m%d)}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/web/public/tiles/nyc.pmtiles"
mkdir -p "$(dirname "$OUT")"
# NYC + nearby NJ/Long Island edges. Zoom 0-14 (street level); MapLibre can over-zoom beyond 14.
pmtiles extract "https://build.protomaps.com/${BUILD}.pmtiles" "$OUT" --bbox=-74.30,40.47,-73.65,40.95 --maxzoom=14
echo "$BUILD" > "$(dirname "$OUT")/BUILD.txt"
ls -la "$OUT"

# Map label fonts (Noto Sans, SIL Open Font License), self-hosted so map visitors never hit a third party.
# Latin glyph ranges only (English + Spanish place names).
FONTS="$(dirname "$OUT")/../fonts"
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "$FONTS/$f"
  for r in 0-255 256-511 8192-8447; do
    curl -s -f -o "$FONTS/$f/$r.pbf" "https://protomaps.github.io/basemaps-assets/fonts/${f// /%20}/$r.pbf"
  done
done
