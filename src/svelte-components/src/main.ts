import 'polyfill-object.fromentries';
import AdminNetworkView from './components/AdminNetworkView.svelte';
import { init as initNetworkInfo } from './lib/NetworkInfo';

export function create(component: string, target: HTMLElement, props: Record<string, any>) {
  switch (component) {
    case "AdminNetworkView":
      return new AdminNetworkView({ target, props });

    default:
      throw new Error("Unknown component");
  }
}

export { initNetworkInfo };
