<script lang="ts" context="module">
    import { writable } from "svelte/store";
    import HomeMachineDialog from "$dialogs/HomeMachineDialog.svelte";
    import ProbeDialog from "$dialogs/ProbeDialog.svelte";
    import ScreenRotationDialog from "$dialogs/ScreenRotationDialog.svelte";
    import UploadDialog from "$dialogs/UploadDialog.svelte";
    import SetTimeDialog from "./SetTimeDialog.svelte";
    import ManualHomeAxisDialog from "./ManualHomeAxisDialog.svelte";
    import SetAxisPositionDialog from "./SetAxisPositionDialog.svelte";
    import MoveToZeroDialog from "./MoveToZeroDialog.svelte";
    import ShutdownDialog from "./ShutdownDialog.svelte";
    import MessageDialog from "./MessageDialog.svelte";
    import SwitchRotaryDialog from "./SwitchRotaryDialog.svelte";

    const HomeMachineDialogProps = writable<HomeMachineDialogPropsType>();
    type HomeMachineDialogPropsType = {
        open: boolean;
        home: () => void;
    };

    const ProbeDialogProps = writable<ProbeDialogPropsType>();
    type ProbeDialogPropsType = {
        open: boolean;
        probeType: "xyz" | "z";
        isRotaryActive: boolean;
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

    const SetTimeDialogProps = writable<SetTimeDialogPropsType>();
    type SetTimeDialogPropsType = {
        open: boolean;
    };

    const ManualHomeAxisDialogProps = writable<ManualHomeAxisDialogPropsType>();
    type ManualHomeAxisDialogPropsType = {
        open: boolean;
        axis: string;
    };

    const SetAxisPositionDialogProps =
        writable<SetAxisPositionDialogPropsType>();
    type SetAxisPositionDialogPropsType = {
        open: boolean;
        axis: string;
    };

    const MoveToZeroDialogProps = writable<MoveToZeroDialogPropsType>();
    type MoveToZeroDialogPropsType = {
        open: boolean;
        axes: "xy" | "z" | "a";
    };

    const ShutdownDialogProps = writable<ShutdownDialogPropsType>();
    type ShutdownDialogPropsType = {
        open: boolean;
    };

    const MessageDialogProps = writable<MessageDialogPropsType>();
    type MessageDialogPropsType = {
        open: boolean;
        title: string;
        message: string;
        noaction: boolean;
    };

    const SwitchRotaryDialogProps = writable<SwitchRotaryDialogPropsType>();
    type SwitchRotaryDialogPropsType = {
        open: boolean;
        isActive: boolean;
        switchMode: (mode: boolean) => void;
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

    export function showDialog(
        dialog: "SetTime",
        props: Omit<SetTimeDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "ManualHomeAxis",
        props: Omit<ManualHomeAxisDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "SetAxisPosition",
        props: Omit<SetAxisPositionDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "MoveToZero",
        props: Omit<MoveToZeroDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "Shutdown",
        props: Omit<ShutdownDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "Message",
        props: Omit<MessageDialogPropsType, "open">
    );

    export function showDialog(
        dialog: "SwitchRotary",
        props: Omit<SwitchRotaryDialogPropsType, "open">
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

            case "SetTime":
                SetTimeDialogProps.set({ ...props, open: true });
                break;

            case "ManualHomeAxis":
                ManualHomeAxisDialogProps.set({ ...props, open: true });
                break;

            case "SetAxisPosition":
                SetAxisPositionDialogProps.set({ ...props, open: true });
                break;

            case "MoveToZero":
                MoveToZeroDialogProps.set({ ...props, open: true });
                break;

            case "Shutdown":
                ShutdownDialogProps.set({ ...props, open: true });
                break;

            case "Message":
                MessageDialogProps.set({ ...props, open: true });
                break;
            
            case "SwitchRotary":
                SwitchRotaryDialogProps.set({ ...props, open: true });
                break;

            default:
                throw new Error(`Unknown dialog '${dialog}'`);
        }
    }
</script>

<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    let bodyObserver: MutationObserver;
    let keyboardObserver: MutationObserver;

    onMount(() => {
        bodyObserver = new MutationObserver(() => {
            const virtualKeyboard = document.getElementById(
                "virtualKeyboardChromeExtension"
            );

            if (virtualKeyboard) {
                bodyObserver.disconnect();
                bodyObserver = undefined;

                const virtualKeyboardOverlay = document.getElementById(
                    "virtualKeyboardChromeExtensionOverlayScrollExtend"
                );

                keyboardObserver = new MutationObserver(() => {
                    const open =
                        virtualKeyboard.getAttribute("_state") === "open";
                    const keyboardHeight = Number.parseFloat(
                        virtualKeyboardOverlay.style.height
                    );

                    const dialogContainers =
                        document.querySelectorAll<HTMLDivElement>(
                            ".mdc-dialog .mdc-dialog__container"
                        );

                    for (let dialogContainer of dialogContainers) {
                        dialogContainer.style["marginBottom"] = open
                            ? `${keyboardHeight}px`
                            : "";
                    }
                });

                keyboardObserver.observe(virtualKeyboard, { attributes: true });
            }
        });

        bodyObserver.observe(document.querySelector("body"), {
            subtree: false,
            childList: true,
        });
    });

    onDestroy(() => {
        if (bodyObserver) {
            bodyObserver.disconnect();
            bodyObserver = undefined;
        }

        if (keyboardObserver) {
            keyboardObserver.disconnect();
            keyboardObserver = undefined;
        }
    });
</script>

<HomeMachineDialog {...$HomeMachineDialogProps} />
<ProbeDialog {...$ProbeDialogProps} />
<ScreenRotationDialog {...$ScreenRotationDialogProps} />
<UploadDialog {...$UploadDialogProps} />
<SetTimeDialog {...$SetTimeDialogProps} />
<ManualHomeAxisDialog {...$ManualHomeAxisDialogProps} />
<SetAxisPositionDialog {...$SetAxisPositionDialogProps} />
<MoveToZeroDialog {...$MoveToZeroDialogProps} />
<ShutdownDialog {...$ShutdownDialogProps} />
<MessageDialog {...$MessageDialogProps} />
<SwitchRotaryDialog {...$SwitchRotaryDialogProps} />
