load_teo_local_settings() {
    TEO_LOCAL_SETTINGS="$SCRIPT_DIR/local.env"

    if [ ! -f "$TEO_LOCAL_SETTINGS" ]; then
        echo "Lokale machineconfiguratie ontbreekt." >&2
        echo "Kopieer dev/local.env.example naar dev/local.env en vul de private waarden in." >&2
        exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    . "$TEO_LOCAL_SETTINGS"
    set +a

    : "${TEO_AUTH_REPOSITORY:?TEO_AUTH_REPOSITORY ontbreekt in dev/local.env}"
    : "${TEO_AUTH_BRANCH:?TEO_AUTH_BRANCH ontbreekt in dev/local.env}"
    : "${TEO_TRAEFIK_CONTAINER:?TEO_TRAEFIK_CONTAINER ontbreekt in dev/local.env}"
    : "${TEO_PROXY_NETWORK:?TEO_PROXY_NETWORK ontbreekt in dev/local.env}"
    : "${TEO_CA_VOLUME:?TEO_CA_VOLUME ontbreekt in dev/local.env}"
    : "${TEO_CERT_RESOLVER:?TEO_CERT_RESOLVER ontbreekt in dev/local.env}"
}
