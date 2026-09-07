import type { NoiseSuppressionProvider } from "../Connection/LocalUserStore";

export interface EffectiveNoiseSuppressionProviderOptions {
    provider: NoiseSuppressionProvider;
    voiceIsolationSupported: boolean;
}

export interface BuildMicrophoneAudioConstraintsOptions {
    microphoneDeviceId: string | undefined;
    autoGainControl: boolean;
    echoCancellation: boolean;
    noiseSuppressionEnabled: boolean;
    browserNoiseSuppressionEnabled: boolean;
    effectiveNoiseSuppressionProvider: NoiseSuppressionProvider;
    browserNoiseSuppressionSupported: boolean;
    workAdventureNoiseSuppressionFailed: boolean;
    customNoiseSuppressionActive: boolean;
    voiceIsolationAdvertised: boolean;
    deviceIdSupported: boolean;
    sampleRateSupported: boolean;
    /**
     * Sample rate requested from getUserMedia while the custom engine is active.
     * DeepFilterNet3 requires 48000 Hz, the legacy DTLN model 16000 Hz.
     */
    noiseSuppressionSampleRate: number;
}

export function getEffectiveNoiseSuppressionProvider({
    provider,
    voiceIsolationSupported,
}: EffectiveNoiseSuppressionProviderOptions): NoiseSuppressionProvider {
    if (provider === "voiceIsolation" && voiceIsolationSupported) {
        return "voiceIsolation";
    }
    return "workadventure";
}

export function buildMicrophoneAudioConstraints({
    microphoneDeviceId,
    autoGainControl,
    echoCancellation,
    noiseSuppressionEnabled,
    browserNoiseSuppressionEnabled,
    effectiveNoiseSuppressionProvider,
    browserNoiseSuppressionSupported,
    workAdventureNoiseSuppressionFailed,
    customNoiseSuppressionActive,
    voiceIsolationAdvertised,
    deviceIdSupported,
    sampleRateSupported,
    noiseSuppressionSampleRate,
}: BuildMicrophoneAudioConstraintsOptions): MediaTrackConstraints {
    const shouldUseBrowserNoiseSuppression =
        browserNoiseSuppressionEnabled &&
        browserNoiseSuppressionSupported &&
        (!customNoiseSuppressionActive || workAdventureNoiseSuppressionFailed);

    const constraints: MediaTrackConstraints = {
        autoGainControl,
        echoCancellation,
        noiseSuppression: shouldUseBrowserNoiseSuppression,
    };

    if (voiceIsolationAdvertised) {
        constraints.voiceIsolation = noiseSuppressionEnabled && effectiveNoiseSuppressionProvider === "voiceIsolation";
    }
    if (microphoneDeviceId !== undefined && deviceIdSupported) {
        constraints.deviceId = { exact: microphoneDeviceId };
    }
    if (customNoiseSuppressionActive && sampleRateSupported) {
        constraints.sampleRate = { ideal: noiseSuppressionSampleRate };
    }

    return constraints;
}
