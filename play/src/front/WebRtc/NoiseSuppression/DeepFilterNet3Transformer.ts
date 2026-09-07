import { AbortError } from "@workadventure/shared-utils/src/Abort/AbortError";
import { DeepFilterNet3Core } from "deepfilternet3-noise-filter";
import {
    DEEPFILTERNET3_ASSET_BASE_URL,
    DEEPFILTERNET3_NOISE_REDUCTION_LEVEL,
    DEEPFILTERNET3_SAMPLE_RATE,
} from "./NoiseSuppressionEngineConfig";
import type { NoiseSuppressionStatusMessage, NoiseSuppressionSupport } from "./NoiseSuppressionTransformerTypes";

interface DeepFilterNet3TransformerOptions {
    onStatusChange?: (message: NoiseSuppressionStatusMessage) => void;
}

/**
 * Applies DeepFilterNet3 noise suppression to the local microphone track.
 *
 * The graph is built as `source -> [bypassGain | deepFilterWorklet] -> destination`. The bypass gain
 * node is wired up synchronously so that the returned MediaStreamTrack carries audio immediately;
 * the DeepFilterNet3 worklet is spliced in once the WASM module and the model have been downloaded.
 * This mirrors the `bypassUntilReady` behaviour of the legacy DTLN worklet: a call never breaks (nor
 * goes silent) while the model is still loading, and a loading failure degrades to clean pass-through
 * audio while the controller falls back to the browser's own noise suppression.
 */
export class DeepFilterNet3Transformer {
    private readonly audioContext: AudioContext;
    private readonly onStatusChange?: (message: NoiseSuppressionStatusMessage) => void;
    private readonly core: DeepFilterNet3Core;
    private lastProcessorStatus: NoiseSuppressionStatusMessage["status"] | undefined;
    private corePreparation: Promise<AudioWorkletNode> | undefined;
    private workletNode: AudioWorkletNode | undefined;
    private sourceNode: MediaStreamAudioSourceNode | undefined;
    private bypassNode: GainNode | undefined;
    private destinationNode: MediaStreamAudioDestinationNode | undefined;
    private outputTrack: MediaStreamTrack | undefined;
    private inputTrack: MediaStreamTrack | undefined;
    private destroyed = false;

    constructor(options?: DeepFilterNet3TransformerOptions) {
        this.audioContext = new AudioContext({ sampleRate: DEEPFILTERNET3_SAMPLE_RATE });
        this.onStatusChange = options?.onStatusChange;
        this.core = new DeepFilterNet3Core({
            sampleRate: DEEPFILTERNET3_SAMPLE_RATE,
            noiseReductionLevel: DEEPFILTERNET3_NOISE_REDUCTION_LEVEL,
            assetConfig: {
                cdnUrl: DEEPFILTERNET3_ASSET_BASE_URL,
            },
        });
    }

    public static getSupport(): NoiseSuppressionSupport {
        if (typeof AudioContext === "undefined") {
            return {
                supported: false,
                message: "AudioContext is not available in this browser.",
            };
        }

        if (typeof AudioWorkletNode === "undefined" || !("audioWorklet" in AudioContext.prototype)) {
            return {
                supported: false,
                message: "AudioWorklet is not available in this browser.",
            };
        }

        if (typeof WebAssembly === "undefined") {
            return {
                supported: false,
                message: "WebAssembly is not available in this browser.",
            };
        }

        return { supported: true };
    }

    public async transform(inputTrack: MediaStreamTrack, signal?: AbortSignal): Promise<MediaStreamTrack> {
        this.throwIfAborted(signal);

        if (this.inputTrack === inputTrack && this.outputTrack) {
            return this.outputTrack;
        }

        this.stop();
        this.onStatusChange?.({
            status: this.lastProcessorStatus === "ready" ? "ready" : "initializing",
        });

        await this.audioContext.resume();
        this.throwIfAborted(signal);

        const inputStream = new MediaStream([inputTrack]);
        this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);
        this.destinationNode = this.audioContext.createMediaStreamDestination();

        // Pass-through branch: keeps audio flowing until the model is ready (and forever if it fails).
        this.bypassNode = this.audioContext.createGain();
        this.sourceNode.connect(this.bypassNode);
        this.bypassNode.connect(this.destinationNode);

        const outputTrack = this.destinationNode.stream.getAudioTracks()[0];
        if (!outputTrack) {
            throw new Error("DeepFilterNet3 did not produce an audio track.");
        }

        this.outputTrack = outputTrack;
        this.inputTrack = inputTrack;

        // Do not await: the track is already usable, the worklet is spliced in when it is ready.
        this.ensureWorkletReady()
            .then((workletNode) => {
                this.attachWorklet(workletNode);
            })
            .catch((error: unknown) => {
                this.reportFailure(error);
            });

        return outputTrack;
    }

    public stop(): void {
        this.disconnect(this.sourceNode);
        this.disconnect(this.bypassNode);
        this.disconnect(this.workletNode);

        this.outputTrack?.stop();

        this.sourceNode = undefined;
        this.bypassNode = undefined;
        this.destinationNode = undefined;
        this.outputTrack = undefined;
        this.inputTrack = undefined;
    }

    public async closeAndDestroy(): Promise<void> {
        this.destroyed = true;
        this.stop();
        this.workletNode = undefined;
        this.corePreparation = undefined;
        try {
            this.core.destroy();
        } catch (error) {
            console.warn("[DeepFilterNet3Transformer] Failed to destroy the DeepFilterNet3 core:", error);
        }
        if (this.audioContext.state !== "closed") {
            await this.audioContext.close();
        }
    }

    /**
     * Downloads + compiles the WASM module and the model once, then creates the worklet node.
     * Subsequent calls reuse the same promise (and the same node).
     */
    private ensureWorkletReady(): Promise<AudioWorkletNode> {
        if (!this.corePreparation) {
            this.corePreparation = (async () => {
                await this.core.initialize();
                return await this.core.createAudioWorkletNode(this.audioContext);
            })().catch((error: unknown) => {
                // Allow a later transform() to retry a transient network failure.
                this.corePreparation = undefined;
                throw error;
            });
        }

        return this.corePreparation;
    }

    /**
     * Swaps the pass-through branch for the DeepFilterNet3 worklet without changing the output track,
     * so neither simple-peer nor LiveKit has to renegotiate.
     */
    private attachWorklet(workletNode: AudioWorkletNode): void {
        this.workletNode = workletNode;

        if (this.destroyed || !this.sourceNode || !this.destinationNode) {
            return;
        }

        this.sourceNode.connect(workletNode);
        workletNode.connect(this.destinationNode);
        this.disconnect(this.bypassNode);
        this.bypassNode = undefined;

        this.logDiagnostics();
        this.exposeTuningHandle();

        this.lastProcessorStatus = "ready";
        this.onStatusChange?.({ status: "ready" });
    }

    /**
     * DeepFilterNet3 is trained for 48 kHz and its worklet never verifies the rate it actually runs
     * at: it just asks the model for a frame length (480 samples = 10 ms at 48 kHz) and keeps going.
     * Running the graph at any other rate feeds the model spectrally shifted audio, which sounds
     * muffled and telephone-like and makes it attenuate speech along with the noise. Log loudly so
     * that this is visible instead of being mistaken for a bad model.
     */
    private logDiagnostics(): void {
        const contextRate = this.audioContext.sampleRate;
        const trackSettings = this.inputTrack?.getSettings();

        console.info("[DeepFilterNet3Transformer] ready", {
            audioContextSampleRate: contextRate,
            microphoneSampleRate: trackSettings?.sampleRate,
            channelCount: trackSettings?.channelCount,
            echoCancellation: trackSettings?.echoCancellation,
            autoGainControl: trackSettings?.autoGainControl,
            browserNoiseSuppression: trackSettings?.noiseSuppression,
            noiseReductionLevel: DEEPFILTERNET3_NOISE_REDUCTION_LEVEL,
        });

        if (contextRate !== DEEPFILTERNET3_SAMPLE_RATE) {
            console.warn(
                `[DeepFilterNet3Transformer] AudioContext runs at ${contextRate} Hz but DeepFilterNet3 ` +
                    `expects ${DEEPFILTERNET3_SAMPLE_RATE} Hz. Expect muffled audio and speech being ` +
                    `attenuated along with the noise.`,
            );
        }
    }

    /**
     * Attenuation can be retuned live from the browser console, so a value can be A/B tested without
     * a rebuild: `__deepFilterNet3.setLevel(20)`. Persist the winner via
     * VITE_DEEPFILTERNET3_NOISE_REDUCTION_LEVEL.
     */
    private exposeTuningHandle(): void {
        if (typeof window === "undefined") {
            return;
        }

        (window as unknown as Record<string, unknown>).__deepFilterNet3 = {
            setLevel: (level: number) => {
                this.core.setSuppressionLevel(level);
                return `DeepFilterNet3 attenuation limit set to ${level} dB`;
            },
            setBypass: (bypass: boolean) => {
                this.core.setNoiseSuppressionEnabled(!bypass);
                return bypass ? "DeepFilterNet3 bypassed (raw microphone)" : "DeepFilterNet3 active";
            },
            info: () => ({
                audioContextSampleRate: this.audioContext.sampleRate,
                microphoneSettings: this.inputTrack?.getSettings(),
                noiseReductionLevel: DEEPFILTERNET3_NOISE_REDUCTION_LEVEL,
            }),
        };
    }

    private reportFailure(error: unknown): void {
        if (this.destroyed) {
            return;
        }

        console.warn("[DeepFilterNet3Transformer] DeepFilterNet3 failed to initialize:", error);
        this.lastProcessorStatus = "error";
        this.onStatusChange?.({
            status: "error",
            message: error instanceof Error ? error.message : "Custom noise suppression failed to initialize.",
        });
    }

    private disconnect(node: AudioNode | undefined): void {
        if (!node) {
            return;
        }

        try {
            node.disconnect();
        } catch {
            // Ignore disconnect errors when tearing down a stale graph.
        }
    }

    private throwIfAborted(signal?: AbortSignal): void {
        if (!signal?.aborted) {
            return;
        }

        throw signal.reason instanceof Error ? signal.reason : new AbortError("Noise suppression transform aborted");
    }
}
