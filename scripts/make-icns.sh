#!/bin/sh
# Builds build/icon.icns from build/icon.png with Apple's iconutil. Run it after
# changing icon.png. electron-builder picks icon.icns over icon.png; its own
# conversion writes the 16 and 32 px sizes as PNG `icp4`/`icp5` entries, which
# macOS decodes as noise (the dmg window title showed it).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
SET=$(mktemp -d)/icon.iconset
trap 'rm -rf "$(dirname "$SET")"' EXIT

mkdir "$SET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ROOT/build/icon.png" --out "$SET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ROOT/build/icon.png" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$ROOT/build/icon.icns"
echo "build/icon.icns gerado"
