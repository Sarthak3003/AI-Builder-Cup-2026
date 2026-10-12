#!/bin/sh
# Regenerates the Saathi app icons (PNG sizes and the SVG favicon). macOS only: uses Quick Look and sips.
# Usage: sh scripts/make-icons.sh
set -eu

out="$(dirname "$0")/../frontend/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out/icons"

# The bubble and dots sit inside the central 80% so launchers that apply a mask never crop them.
artwork='<rect x="116" y="140" width="280" height="190" rx="48" fill="#fff"/>
  <path d="M158 322h74l-74 70z" fill="#fff"/>
  <circle cx="196" cy="235" r="26" fill="#ea4335"/>
  <circle cx="256" cy="235" r="26" fill="#fbbc04"/>
  <circle cx="316" cy="235" r="26" fill="#34a853"/>'

svg() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n  <rect width="512" height="512" rx="%s" fill="#1a73e8"/>\n  %s\n</svg>\n' "$1" "$artwork"
}

svg 112 > "$out/saathi.svg"
svg 0 > "$tmp/icon.svg"

qlmanage -t -s 512 -o "$tmp" "$tmp/icon.svg" >/dev/null 2>&1
cp "$tmp/icon.svg.png" "$out/icons/icon-512.png"
cp "$tmp/icon.svg.png" "$out/icons/icon-maskable-512.png"
sips -z 192 192 "$tmp/icon.svg.png" --out "$out/icons/icon-192.png" >/dev/null
sips -z 180 180 "$tmp/icon.svg.png" --out "$out/icons/apple-touch-icon.png" >/dev/null
ls -l "$out/icons" "$out/saathi.svg"
