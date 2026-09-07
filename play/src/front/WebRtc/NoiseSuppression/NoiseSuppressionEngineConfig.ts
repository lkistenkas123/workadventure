/**
 * Central configuration for the local microphone noise suppression engine.
 *
 * Two engines are shipped side by side and can be swapped at build time or at runtime:
 *  - "dtln" (default): the `@workadventure/noise-suppression` DTLN audio worklet.
 *  - "deepfilternet3": DeepFilterNet3 via the `deepfilternet3-noise-filter` package.
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

/**
 * DTLN is the default. DeepFilterNet3 was trialled as a replacement and rejected: with the engine
 * bypassed the same audio chain sounds fine, so the microphone and the 48 kHz graph are not at
 * fault, but with it active speech comes out muffled and partly suppressed along with the noise,
 * at every attenuation limit that was tried. It stays available behind the flag below for a
 * retry with a future model revision.
 */
const DEFAULT_ENGINE: NoiseSuppressionEngine = "dtln";

function parseEngine(value: string | null | undefined): NoiseSuppressionEngine | undefined {
    return value === "dtln" || value === "deepfilternet3" ? value : undefined;
}

/**
 * Build-time feature flag: set `VITE_NOISE_SUPPRESSION_ENGINE=deepfilternet3` to ship DeepFilterNet3.
 */
const ENGINE_FROM_ENV: NoiseSuppressionEngine = parseEngine(viteEnv.VITE_NOISE_SUPPRESSION_ENGINE) ?? DEFAULT_ENGINE;

/**
 * Runtime override, so both engines can be A/B tested without a rebuild. Both are bundled anyway;
 * the build-time flag only decides which one is picked by default.
 */
const ENGINE_OVERRIDE_KEY = "noiseSuppressionEngine";

function readEngineOverride(): NoiseSuppressionEngine | undefined {
    try {
        return parseEngine(localStorage.getItem(ENGINE_OVERRIDE_KEY));
    } catch {
        // localStorage can be unavailable (private mode, blocked site data); use the build flag.
        return undefined;
    }
}

export function getNoiseSuppressionEngine(): NoiseSuppressionEngine {
    return readEngineOverride() ?? ENGINE_FROM_ENV;
}

/**
 * Console helper for switching engines while debugging: `__noiseSuppression.useDtln()`.
 * The engine is read when the audio graph is built, so the page is reloaded to apply it.
 */
if (typeof window !== "undefined") {
    const setEngine = (engine: NoiseSuppressionEngine | undefined) => {
        try {
            if (engine === undefined) {
                localStorage.removeItem(ENGINE_OVERRIDE_KEY);
            } else {
                localStorage.setItem(ENGINE_OVERRIDE_KEY, engine);
            }
        } catch {
            return "Could not persist the choice: localStorage is unavailable.";
        }
        window.location.reload();
        return `Noise suppression engine set to ${engine ?? ENGINE_FROM_ENV}, reloading...`;
    };

    (window as unknown as Record<string, unknown>).__noiseSuppression = {
        engine: () => getNoiseSuppressionEngine(),
        useDtln: () => setEngine("dtln"),
        useDeepFilterNet3: () => setEngine("deepfilternet3"),
        reset: () => setEngine(undefined),
    };
}

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

export function getNoiseSuppressionSampleRate(engine: NoiseSuppressionEngine = getNoiseSuppressionEngine()): number {
    return engine === "dtln" ? DTLN_SAMPLE_RATE : DEEPFILTERNET3_SAMPLE_RATE;
}
