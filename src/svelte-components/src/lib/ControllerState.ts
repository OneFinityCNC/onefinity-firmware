import { get, writable } from "svelte/store";
import { processNetworkInfo } from "./NetworkInfo";

export const networkInfo = writable({});

export const probingActive = writable(false);
export const probeContacted = writable(false);
export const probingFailed = writable(false);
export const probingStarted = writable(false);
export const probingComplete = writable(false);
export const systemReady = writable(false);
export const homeMachineComplete = writable(false);

export function handleControllerStateUpdate(state: Record<string, any>) {
    if (!get(systemReady)) {
        systemReady.set(true);
    }

    if (state.xx === "READY" && !get(homeMachineComplete)) {
        homeMachineComplete.set(true);
    }

    if (get(probingActive) && get(systemReady) && get(homeMachineComplete)) {
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