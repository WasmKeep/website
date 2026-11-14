#!/usr/bin/env bash
# Builds the site with Zola into public/, which the front embeds.
#
# ZOLA is the zola command (default: `zola` on PATH). To run it from the
# official image with podman instead:
#   ZOLA_IMAGE=ghcr.io/getzola/zola:v0.23.6 scripts/build-site.sh
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
if [[ -n ${ZOLA_IMAGE:-} ]]; then
  zola=(podman run --rm -v "$root:/site:Z" -w /site "$ZOLA_IMAGE")
else
  read -r -a zola <<<"${ZOLA:-zola}"
fi
"${zola[@]}" build --output-dir public --force
