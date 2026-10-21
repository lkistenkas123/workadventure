#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../contrib/docker" && pwd)

. "$SCRIPT_DIR/common.sh"
load_teo_local_settings

wait_for_status() {
    URL=$1
    EXPECTED=$2
    ATTEMPT=0

    while [ "$ATTEMPT" -lt 15 ]; do
        STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$URL" || true)
        if [ "$STATUS" = "$EXPECTED" ]; then
            return 0
        fi
        ATTEMPT=$((ATTEMPT + 1))
        sleep 2
    done

    echo "$URL gaf HTTP $STATUS in plaats van $EXPECTED." >&2
    return 1
}

docker compose \
    --project-name teo-dev \
    --env-file "$COMPOSE_DIR/.env.dev" \
    -f "$COMPOSE_DIR/docker-compose.yaml" \
    -f "$COMPOSE_DIR/docker-compose.dev.yaml" \
    config --quiet

docker compose \
    --project-name teo-dev \
    --env-file "$COMPOSE_DIR/.env.dev" \
    -f "$COMPOSE_DIR/docker-compose.yaml" \
    -f "$COMPOSE_DIR/docker-compose.dev.yaml" \
    ps

wait_for_status https://teo.docker 200
wait_for_status https://auth.teo.docker/login 200
wait_for_status https://teo.docker/map-storage/office/the-everywhere-office.wam 200

HTTP_REDIRECT=$(curl --silent --show-error --output /dev/null \
    --write-out '%{http_code} %{redirect_url}' http://teo.docker)
test "$HTTP_REDIRECT" = "301 https://teo.docker/" || {
    echo "Onverwachte HTTP-redirect: $HTTP_REDIRECT" >&2
    exit 1
}

LOGIN_STATUS=$(curl --silent --show-error --output /dev/null \
    --write-out '%{http_code}' \
    'https://teo.docker/login-screen?playUri=https%3A%2F%2Fteo.docker%2F~%2Foffice%2Fthe-everywhere-office.wam')
test "$LOGIN_STATUS" = "302" || {
    echo "OpenID-login gaf HTTP $LOGIN_STATUS in plaats van 302." >&2
    exit 1
}

echo "Compose, HTTPS-redirect, applicatie, auth, OpenID en map werken."
