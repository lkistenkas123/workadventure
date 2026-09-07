import { DeepFilterNet3Transformer } from "./DeepFilterNet3Transformer";
import { NOISE_SUPPRESSION_ENGINE } from "./NoiseSuppressionEngineConfig";
import { NoiseSuppressionTransformer } from "./NoiseSuppressionTransformer";
import type {
    NoiseSuppressionSupport,
    NoiseSuppressionTransformerInterface,
    NoiseSuppressionTransformerOptions,
} from "./NoiseSuppressionTransformerTypes";

/**
 * Returns the transformer for the engine selected by `VITE_NOISE_SUPPRESSION_ENGINE`
 * (DeepFilterNet3 by default, the legacy DTLN worklet when set to "dtln").
 */
export function createNoiseSuppressionTransformer(
    options?: NoiseSuppressionTransformerOptions,
): NoiseSuppressionTransformerInterface {
    if (NOISE_SUPPRESSION_ENGINE === "dtln") {
        return new NoiseSuppressionTransformer(options);
    }

    return new DeepFilterNet3Transformer(options);
}

export function getNoiseSuppressionSupport(): NoiseSuppressionSupport {
    if (NOISE_SUPPRESSION_ENGINE === "dtln") {
        return NoiseSuppressionTransformer.getSupport();
    }

    return DeepFilterNet3Transformer.getSupport();
}
