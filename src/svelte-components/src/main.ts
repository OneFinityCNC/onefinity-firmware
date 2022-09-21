import "polyfill-object.fromentries";
import matchAll from "string.prototype.matchall";

matchAll.shim();

import AdminNetworkView from "$components/AdminNetworkView.svelte";
import AdminGeneralView from "$components/AdminGeneralView.svelte";
import SettingsView from "$components/SettingsView.svelte";
import HelpView from "$components/HelpView.svelte";
import DialogHost, { showDialog } from "$dialogs/DialogHost.svelte";
import { handleConfigUpdate, setDisplayUnits } from "$lib/ConfigStore";
import { handleControllerStateUpdate } from "$lib/ControllerState";
import { registerControllerMethods } from "$lib/RegisterControllerMethods";
import { checkFirmwareUpgrades, isNewFirmwareAvailable, getLatestFirmwareVersion } from "$lib/Firmware";
import Preferences from "$lib/Preferences";

export function createComponent(component: string, target: HTMLElement, props: Record<string, any>) {
    switch (component) {
        case "AdminNetworkView":
            return new AdminNetworkView({ target, props });

        case "AdminGeneralView":
            return new AdminGeneralView({ target, props });

        case "SettingsView":
            return new SettingsView({ target, props });

        case "HelpView":
            return new HelpView({ target, props });

        case "DialogHost":
            return new DialogHost({ target, props });

        default:
            throw new Error("Unknown component");
    }
}

export {
    showDialog,
    handleControllerStateUpdate,
    handleConfigUpdate,
    checkFirmwareUpgrades,
    isNewFirmwareAvailable,
    getLatestFirmwareVersion,
    registerControllerMethods,
    setDisplayUnits,
    Preferences
};
