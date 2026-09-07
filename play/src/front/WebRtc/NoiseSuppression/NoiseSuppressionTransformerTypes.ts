/**
 * Shared contract between the noise suppression engines (DeepFilterNet3 and the legacy DTLN worklet).
 */

export interface NoiseSuppressionStatusMessage {
    status: "initializing" | "ready" | "error";
    message?: string;
}

export interface NoiseSuppressionSupport {
    supported: boolean;
    message?: string;
}

export interface NoiseSuppressionTransformerOptions {
    onStatusChange?: (message: NoiseSuppressionStatusMessage) => void;
}

/**
 * The API every engine implements; `NoiseSuppressionController` only ever talks to this interface.
 */
export interface NoiseSuppressionTransformerInterface {
    transform(inputTrack: MediaStreamTrack, signal?: AbortSignal): Promise<MediaStreamTrack>;
    stop(): void;
    closeAndDestroy(): Promise<void>;
}
