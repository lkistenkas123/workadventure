#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../contrib/docker" && pwd)

. "$SCRIPT_DIR/common.sh"
load_teo_local_settings

docker compose \
    --project-name teo-dev \
    --env-file "$COMPOSE_DIR/.env.dev" \
    -f "$COMPOSE_DIR/docker-compose.yaml" \
    -f "$COMPOSE_DIR/docker-compose.dev.yaml" \
    down
