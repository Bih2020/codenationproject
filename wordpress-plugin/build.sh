#!/usr/bin/env bash
# Builds gladmoment-wordpress-plugin.zip: the WordPress plugin with the app bundled inside.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="$here/../gratitude-app"
out="$here/../gladmoment-wordpress-plugin.zip"
tmp="$(mktemp -d)"
cp -r "$here/gladmoment" "$tmp/gladmoment"
mkdir -p "$tmp/gladmoment/app"
(cd "$app" && cp -r index.html privacy.html privacy-fr.html config.json manifest.webmanifest sw.js .htaccess css js icons "$tmp/gladmoment/app/")
rm -f "$out"
(cd "$tmp" && zip -qr "$out" gladmoment)
rm -rf "$tmp"
echo "Built $out"
