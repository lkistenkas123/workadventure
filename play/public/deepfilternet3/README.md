# DeepFilterNet3 assets (self-hosted)

> **DeepFilterNet3 is not the active engine.** DTLN is the default; DeepFilterNet3 degraded speech
> too much in testing. These assets stay committed so the engine can be switched back on (build
> flag `VITE_NOISE_SUPPRESSION_ENGINE=deepfilternet3`, or `__noiseSuppression.useDeepFilterNet3()`
> in the browser console) without re-fetching 24 MB.

The `deepfilternet3-noise-filter` package fetches two binaries at runtime:

| File | Size |
|---|---|
| `v3/pkg/df_bg.wasm` | ~16 MB |
| `v3/models/DeepFilterNet3_onnx.tar.gz` | ~8 MB |

By default the library downloads them from `https://cdn.mezon.ai/...`. We host them ourselves
instead: `DEEPFILTERNET3_ASSET_BASE_URL` in
`src/front/WebRtc/NoiseSuppression/NoiseSuppressionEngineConfig.ts` defaults to `/deepfilternet3`,
which resolves to this directory (Vite serves `public/` at the site root).

## Getting the files

The two binaries are **committed to the repository**, so a fresh clone and the Docker build
(`COPY play ./play`) already have everything they need — no extra build step required.

To refresh them (new upstream version, or after they were removed locally):

```bash
cd play
npm run noise-suppression:fetch-assets
```

## Serving them from another CDN

Upload the same `v3/pkg/df_bg.wasm` and `v3/models/DeepFilterNet3_onnx.tar.gz` layout to your own
CDN and set at build time:

```
VITE_DEEPFILTERNET3_ASSET_BASE_URL=https://cdn.example.com/deepfilternet3
```

The base URL must allow cross-origin `fetch()` (CORS) and should serve the `.wasm` file with
`Content-Type: application/wasm`.
