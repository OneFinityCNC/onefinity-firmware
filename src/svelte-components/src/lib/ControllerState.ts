import { get, writable } from "svelte/store";
import { processNetworkInfo } from "./NetworkInfo";

export const networkInfo = writable({});

export const probingActive = writable(false);
export const probeContacted = writable(false);
export const probingStarted = writable(false);
export const probingFailed = writable(false);
export const probingComplete = writable(false);

// Center probing: result of the second placement's Z-match check, reported
// by the G-code through the #<_ofprobe_ok> / #<_ofprobe_dz> variables.
// null = unknown, 1 = accepted, 0 = rejected (origin left unchanged).
export const centerProbeOk = writable<number | null>(null);
export const centerProbeDz = writable<number | null>(null);

export function handleControllerStateUpdate(state: Record<string, any>) {
    if (state && "ofprobe_ok" in state) {
        centerProbeOk.set(state.ofprobe_ok);
    }

    if (state && "ofprobe_dz" in state) {
        centerProbeDz.set(state.ofprobe_dz);
    }

    if (get(probingActive)) {
        if (state.pw === 0) {
            probeContacted.set(true);
        }

        if (state.log?.msg === "Switch not found") {
            probingFailed.set(true);
        }

        if (state.cycle !== "idle") {
            probingStarted.set(true);
        }

        if (state.cycle === "idle" && get(probingStarted)) {
            probingStarted.set(false);
            probingComplete.set(true);
        }
    }
}