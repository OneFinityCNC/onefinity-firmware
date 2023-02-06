import { writable } from "svelte/store";

type DisplayUnits = "METRIC" | "IMPERIAL";

export const Config = writable<Record<string, any>>({});
export const DisplayUnits = writable<DisplayUnits>();

export function handleConfigUpdate(config: Record<string, any>) {
    Config.set(config);
}

export function setDisplayUnits(value: DisplayUnits) {
    DisplayUnits.set(value);
}