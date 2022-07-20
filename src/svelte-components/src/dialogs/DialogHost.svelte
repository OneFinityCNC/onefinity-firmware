<script lang="ts" context="module">
  import { writable } from "svelte/store";
  import HomeMachineDialog from "$dialogs/HomeMachineDialog.svelte";
  import ProbeDialog from "$dialogs/ProbeDialog.svelte";
  import ScreenRotationDialog from "$dialogs/ScreenRotationDialog.svelte";
  import UploadDialog from "$dialogs/UploadDialog.svelte";

  const HomeMachineDialogProps = writable<HomeMachineDialogPropsType>();
  type HomeMachineDialogPropsType = {
    open: boolean;
    home: () => void;
  };

  const ProbeDialogProps = writable<ProbeDialogPropsType>();
  type ProbeDialogPropsType = {
    open: boolean;
    probeType: "xyz" | "z";
  };

  const ScreenRotationDialogProps = writable<ScreenRotationDialogPropsType>();
  type ScreenRotationDialogPropsType = {
    open: boolean;
  };

  const UploadDialogProps = writable<UploadDialogPropsType>();
  type UploadDialogPropsType = {
    open: boolean;
    file: File;
    onComplete: () => void;
  };

  export function showDialog(
    dialog: "HomeMachine",
    props: Omit<HomeMachineDialogPropsType, "open">
  );

  export function showDialog(
    dialog: "Probe",
    props: Omit<ProbeDialogPropsType, "open">
  );

  export function showDialog(
    dialog: "ScreenRotation",
    props: Omit<ScreenRotationDialogPropsType, "open">
  );

  export function showDialog(
    dialog: "Upload",
    props: Omit<UploadDialogPropsType, "open">
  );

  export function showDialog(dialog: string, props: any) {
    switch (dialog) {
      case "HomeMachine":
        HomeMachineDialogProps.set({ ...props, open: true });
        break;

      case "Probe":
        ProbeDialogProps.set({ ...props, open: true });
        break;

      case "ScreenRotation":
        ScreenRotationDialogProps.set({ ...props, open: true });
        break;

      case "Upload":
        UploadDialogProps.set({ ...props, open: true });
        break;

      default:
        throw new Error(`Unknown dialog '${dialog}`);
    }
  }
</script>

<HomeMachineDialog {...$HomeMachineDialogProps} />
<ProbeDialog {...$ProbeDialogProps} />
<ScreenRotationDialog {...$ScreenRotationDialogProps} />
<UploadDialog {...$UploadDialogProps} />
