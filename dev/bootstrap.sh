#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_DIR="$REPO_DIR/contrib/docker"
AUTH_DIR="$REPO_DIR/auth"

. "$SCRIPT_DIR/common.sh"
load_teo_local_settings

command -v docker >/dev/null 2>&1 || {
    echo "Docker is niet geïnstalleerd of staat niet in PATH." >&2
    exit 1
}

docker info >/dev/null 2>&1 || {
    echo "Docker draait niet." >&2
    exit 1
}

docker network inspect "$TEO_PROXY_NETWORK" >/dev/null 2>&1 || {
    echo "Het geconfigureerde externe proxy-netwerk ontbreekt. Start eerst de lokale proxy-stack." >&2
    exit 1
}

docker volume inspect "$TEO_CA_VOLUME" >/dev/null 2>&1 || {
    echo "Het geconfigureerde CA-volume ontbreekt. Start eerst de lokale proxy-stack." >&2
    exit 1
}

if ! docker ps --format '{{.Names}}' | grep -qx "$TEO_TRAEFIK_CONTAINER"; then
    echo "De geconfigureerde Traefik-container draait niet. Start eerst de lokale proxy-stack." >&2
    exit 1
fi

if ! git -C "$REPO_DIR" remote get-url upstream >/dev/null 2>&1; then
    git -C "$REPO_DIR" remote add upstream https://github.com/workadventure/workadventure.git
fi

if [ ! -d "$AUTH_DIR/.git" ]; then
    git clone --branch "$TEO_AUTH_BRANCH" "$TEO_AUTH_REPOSITORY" "$AUTH_DIR"
fi

if [ ! -f "$COMPOSE_DIR/.env.dev" ]; then
    cp "$COMPOSE_DIR/.env.dev.example" "$COMPOSE_DIR/.env.dev"
    echo "Aangemaakt: $COMPOSE_DIR/.env.dev"
fi

if [ ! -f "$AUTH_DIR/.env.dev" ]; then
    cp "$AUTH_DIR/.env.dev.example" "$AUTH_DIR/.env.dev"
    echo "Aangemaakt: $AUTH_DIR/.env.dev"
fi

echo "Bootstrap gereed. Start de omgeving met: ./dev/up.sh"
