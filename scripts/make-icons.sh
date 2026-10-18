#!/bin/sh
# Regenerate smaller app icons from the supplied Saathi brand artwork (macOS).
set -eu
out="$(dirname "$0")/../frontend/public"
sips -z 192 192 "$out/icons/icon-512.png" --out "$out/icons/icon-192.png" >/dev/null
sips -z 180 180 "$out/icons/icon-512.png" --out "$out/icons/apple-touch-icon.png" >/dev/null
sips -z 48 48 "$out/icons/icon-512.png" --out "$out/icons/favicon.png" >/dev/null
sips -z 512 512 "$out/saathi-logo-transparent.png" --out "$out/icons/icon-maskable-512.png" >/dev/null
