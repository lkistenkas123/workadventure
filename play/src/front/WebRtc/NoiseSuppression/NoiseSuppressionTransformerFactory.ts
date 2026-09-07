import { DeepFilterNet3Transformer } from "./DeepFilterNet3Transformer";
import { getNoiseSuppressionEngine } from "./NoiseSuppressionEngineConfig";
import { NoiseSuppressionTransformer } from "./NoiseSuppressionTransformer";
import type {
    NoiseSuppressionSupport,
    NoiseSuppressionTransformerInterface,
    NoiseSuppressionTransformerOptions,
} from "./NoiseSuppressionTransformerTypes";

/**
 * Returns the transformer for the selected engine: DTLN by default, DeepFilterNet3 when
 * `VITE_NOISE_SUPPRESSION_ENGINE` or the localStorage override asks for it.
 */
export function createNoiseSuppressionTransformer(
    options?: NoiseSuppressionTransformerOptions,
): NoiseSuppressionTransformerInterface {
    if (getNoiseSuppressionEngine() === "dtln") {
        return new NoiseSuppressionTransformer(options);
    }

    return new DeepFilterNet3Transformer(options);
}

export function getNoiseSuppressionSupport(): NoiseSuppressionSupport {
    if (getNoiseSuppressionEngine() === "dtln") {
        return NoiseSuppressionTransformer.getSupport();
    }

    return DeepFilterNet3Transformer.getSupport();
}
