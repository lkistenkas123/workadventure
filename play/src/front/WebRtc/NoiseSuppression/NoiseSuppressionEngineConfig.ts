/**
 * Central configuration for the local microphone noise suppression engine.
 *
 * Two engines are shipped side by side so that it is possible to switch back at build time:
 *  - "deepfilternet3" (default): DeepFilterNet3 via the `deepfilternet3-noise-filter` package.
 *  - "dtln" (legacy): the previous `@workadventure/noise-suppression` DTLN audio worklet.
 *
 * Nothing else in the codebase needs to know which engine is active: the transformer factory in
 * `NoiseSuppressionTransformerFactory.ts` exposes the very same API for both.
 */

export type NoiseSuppressionEngine = "deepfilternet3" | "dtln";

/**
 * Vite exposes `VITE_`-prefixed variables at build time. No `.env`/Docker change is required to run
 * with the defaults below; set the variables only if you want to deviate.
 */
const viteEnv: Record<string, string | undefined> =
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

const DEFAULT_ENGINE: NoiseSuppressionEngine = "deepfilternet3";

/**
 * Feature flag: set `VITE_NOISE_SUPPRESSION_ENGINE=dtln` to fall back to the legacy DTLN worklet.
 */
export const NOISE_SUPPRESSION_ENGINE: NoiseSuppressionEngine =
    viteEnv.VITE_NOISE_SUPPRESSION_ENGINE === "dtln" ? "dtln" : DEFAULT_ENGINE;

/**
 * Base URL the DeepFilterNet3 assets are fetched from. The loader appends:
 *   - `${base}/v3/pkg/df_bg.wasm`
 *   - `${base}/v3/models/DeepFilterNet3_onnx.tar.gz`
 *
 * The default is a same-origin path so the assets are self-hosted (see
 * `public/deepfilternet3/README.md`) instead of hitting the upstream `cdn.mezon.ai` CDN.
 * Override with `VITE_DEEPFILTERNET3_ASSET_BASE_URL` to point at your own CDN.
 */
export const DEEPFILTERNET3_ASSET_BASE_URL: string =
    viteEnv.VITE_DEEPFILTERNET3_ASSET_BASE_URL?.replace(/\/+$/, "") || "/deepfilternet3";

/**
 * Noise reduction strength handed to DeepFilterNet3: the attenuation limit in dB, clamped to 0-100.
 * Lower values suppress less noise but leave the voice more intact; 100 lets the model attenuate
 * as much as it wants, which is also where it is most likely to chew on speech.
 * Override with `VITE_DEEPFILTERNET3_NOISE_REDUCTION_LEVEL` to retune without touching the code.
 */
function readNoiseReductionLevel(): number {
    const parsed = Number.parseInt(viteEnv.VITE_DEEPFILTERNET3_NOISE_REDUCTION_LEVEL ?? "", 10);
    if (Number.isNaN(parsed)) {
        return 50;
    }
    return Math.max(0, Math.min(100, parsed));
}

export const DEEPFILTERNET3_NOISE_REDUCTION_LEVEL = readNoiseReductionLevel();

/**
 * DeepFilterNet3 only runs at 48 kHz; the legacy DTLN model expects 16 kHz.
 * This drives both the AudioContext and the `sampleRate` getUserMedia constraint.
 */
export const DEEPFILTERNET3_SAMPLE_RATE = 48000;
export const DTLN_SAMPLE_RATE = 16000;

export function getNoiseSuppressionSampleRate(engine: NoiseSuppressionEngine = NOISE_SUPPRESSION_ENGINE): number {
    return engine === "dtln" ? DTLN_SAMPLE_RATE : DEEPFILTERNET3_SAMPLE_RATE;
}
