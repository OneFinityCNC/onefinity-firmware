import { writable } from "svelte/store";
import { showDialog, EasyAdapterDialogProps } from "$dialogs/DialogHost.svelte";

type DisplayUnits = "METRIC" | "IMPERIAL";

export const Config = writable<Record<string, any>>({});
export const DisplayUnits = writable<DisplayUnits>();

let easyAdapterTimer: ReturnType<typeof setTimeout> | null = null;
let hasShownEasyAdapter = false;

export function handleConfigUpdate(config: Record<string, any>) {
    Config.set(config);
    
    // Check if easy-adapter is enabled and show dialog on app load
    if (config.settings && config.settings["easy-adapter"] && !hasShownEasyAdapter) {
        hasShownEasyAdapter = true;

        try {
            // Clear any existing timer first
            if (easyAdapterTimer) {
                clearTimeout(easyAdapterTimer);
                easyAdapterTimer = null;
            }
            
            // Show EasyAdapter dialog
            showDialog("EasyAdapter", {});
            
            // Auto-close after 90 seconds
            easyAdapterTimer = setTimeout(() => {
                try {
                    EasyAdapterDialogProps.set({ open: false });
                } catch (error) {
                    console.error("Failed to close EasyAdapter dialog:", error);
                } finally {
                    easyAdapterTimer = null;
                }
            }, 5000);
        } catch (error) {
            console.error("Failed to show EasyAdapter dialog:", error);
            hasShownEasyAdapter = false; // Reset on error
        }
    }
}

export function setDisplayUnits(value: DisplayUnits) {
    DisplayUnits.set(value);
}