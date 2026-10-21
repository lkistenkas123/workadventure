#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"
load_teo_local_settings

: "${TEO_PRODUCTION_SSH:?TEO_PRODUCTION_SSH ontbreekt in dev/local.env}"
: "${TEO_PRODUCTION_MAP_CONTAINER:?TEO_PRODUCTION_MAP_CONTAINER ontbreekt in dev/local.env}"
: "${TEO_LOCAL_MAP_CONTAINER:?TEO_LOCAL_MAP_CONTAINER ontbreekt in dev/local.env}"

TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/teo-map-sync.XXXXXX")

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT HUP INT TERM

docker inspect "$TEO_LOCAL_MAP_CONTAINER" >/dev/null 2>&1 || {
    echo "Lokale map-storage draait niet. Start eerst ./dev/up.sh." >&2
    exit 1
}

echo "Map ophalen uit de geconfigureerde productieomgeving..."
ssh "$TEO_PRODUCTION_SSH" \
    "docker exec $TEO_PRODUCTION_MAP_CONTAINER tar -C /maps -czf - office" \
    | tar -xzf - -C "$TEMP_DIR"

test -f "$TEMP_DIR/office/the-everywhere-office.wam" || {
    echo "De verwachte productie-WAM ontbreekt in de download." >&2
    exit 1
}

docker exec "$TEO_LOCAL_MAP_CONTAINER" mkdir -p /maps/office
docker cp "$TEMP_DIR/office/." "$TEO_LOCAL_MAP_CONTAINER:/maps/office"
docker restart "$TEO_LOCAL_MAP_CONTAINER" >/dev/null

echo "Productiemap is eenrichtingsverkeer naar de lokale map-storage gekopieerd."
