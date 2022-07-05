import 'polyfill-object.fromentries';
import AdminNetworkView from './components/AdminNetworkView.svelte';
import { init as initNetworkInfo } from './lib/NetworkInfo';

import DialogHost from "./components/DialogHost.svelte";
import DialogProps from "./lib/DialogProps";
import type { DialogPropsTypes } from "./lib/DialogProps";

export function createComponent(component: string, target: HTMLElement, props: Record<string, any>) {
  switch (component) {
    case "AdminNetworkView":
      return new AdminNetworkView({ target, props });

    case "DialogHost":
      return new DialogHost({ target, props });

    default:
      throw new Error("Unknown component");
  }
}

export function showDialog<T extends keyof typeof DialogProps>(dialog: T, props: DialogPropsTypes[T]) {
  switch (dialog) {
    case "HomeMachine":
      DialogProps.HomeMachine.set({ ...props, open: true });
      break;

    default:
      throw new Error(`Unknown dialog '${dialog}`);
  }
}

export {
  initNetworkInfo
};
