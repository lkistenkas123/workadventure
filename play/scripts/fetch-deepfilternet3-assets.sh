#!/usr/bin/env bash
#
# Downloads the DeepFilterNet3 runtime assets (WASM + model) into play/public/deepfilternet3/
# so that they are served from our own origin instead of the upstream cdn.mezon.ai CDN.
#
# Usage (from the play/ directory):
#   ./scripts/fetch-deepfilternet3-assets.sh
#
# Override the upstream source with DEEPFILTERNET3_UPSTREAM_URL if needed.
set -euo pipefail

UPSTREAM="${DEEPFILTERNET3_UPSTREAM_URL:-https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3}"
TARGET_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/deepfilternet3"

mkdir -p "$TARGET_DIR/v3/pkg" "$TARGET_DIR/v3/models"

echo "Downloading DeepFilterNet3 assets from $UPSTREAM into $TARGET_DIR"
curl -fSL --progress-bar -o "$TARGET_DIR/v3/pkg/df_bg.wasm" "$UPSTREAM/v3/pkg/df_bg.wasm"
curl -fSL --progress-bar -o "$TARGET_DIR/v3/models/DeepFilterNet3_onnx.tar.gz" "$UPSTREAM/v3/models/DeepFilterNet3_onnx.tar.gz"

echo "Done:"
ls -lh "$TARGET_DIR/v3/pkg/df_bg.wasm" "$TARGET_DIR/v3/models/DeepFilterNet3_onnx.tar.gz"
