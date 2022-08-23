<script lang="ts" context="module">
  import HomeMachineDialog from "$dialogs/HomeMachineDialog.svelte";
  import ProbeDialog from "$dialogs/ProbeDialog.svelte";
  import {
    HomeMachineProps,
    ProbeProps,
    type HomeMachinePropsType,
    type ProbePropsType,
  } from "$dialogs/DialogProps";

  export function showDialog(
    dialog: "HomeMachine",
    props: Omit<HomeMachinePropsType, "open">
  );

  export function showDialog(
    dialog: "Probe",
    props: Omit<ProbePropsType, "open">
  );

  export function showDialog(dialog: string, props: any) {
    switch (dialog) {
      case "HomeMachine":
        HomeMachineProps.set({ ...props, open: true });
        break;

      case "Probe":
        ProbeProps.set({ ...props, open: true });
        break;

      default:
        throw new Error(`Unknown dialog '${dialog}`);
    }
  }
</script>

<HomeMachineDialog {...$HomeMachineProps} />
<ProbeDialog {...$ProbeProps} />
