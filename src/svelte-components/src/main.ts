import 'polyfill-object.fromentries';
import matchAll from "string.prototype.matchall";

matchAll.shim();

import AdminNetworkView from '$components/AdminNetworkView.svelte';
import DialogHost, { showDialog } from "$dialogs/DialogHost.svelte";
import Devmode from "$components/Devmode.svelte";
import { handleConfigUpdate } from '$lib/ConfigStore';
import { handleControllerStateUpdate } from "$lib/ControllerState";
import { registerControllerMethods } from "$lib/RegisterControllerMethods";

export function createComponent(component: string, target: HTMLElement, props: Record<string, any>) {
  switch (component) {
    case "AdminNetworkView":
      return new AdminNetworkView({ target, props });

    case "DialogHost":
      return new DialogHost({ target, props });

    case "Devmode":
      return new Devmode({ target, props });

    default:
      throw new Error("Unknown component");
  }
}

export {
  showDialog,
  handleControllerStateUpdate,
  handleConfigUpdate,
  registerControllerMethods,
};
