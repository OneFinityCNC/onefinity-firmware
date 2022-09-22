import { get, writable } from "svelte/store";
import { processNetworkInfo } from "./NetworkInfo";

type FirmwareDownloadInfo = {
    complete?: boolean;
    failed?: boolean;
    size?: number;
    bytes?: number;
}

export const networkInfo = writable({});

export const firmwareDownload = writable<FirmwareDownloadInfo>({});

export const probingActive = writable(false);
export const probeContacted = writable(false);
export const probingStarted = writable(false);
export const probingFailed = writable(false);
export const probingComplete = writable(false);

export function handleControllerStateUpdate(state: Record<string, any>) {
    if (state.networkInfo) {
        processNetworkInfo(state.networkInfo);
        delete state.networkInfo;
    }

    if (state.firmware_download) {
        firmwareDownload.set(state.firmware_download);
        delete state.firmware_download;
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