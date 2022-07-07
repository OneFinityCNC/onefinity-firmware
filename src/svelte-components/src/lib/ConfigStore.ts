import { writable } from "svelte/store";

export const Config = writable<Record<string, any>>({});

export function handleConfigUpdate(config: Record<string, any>) {
    Config.set(config);
}
