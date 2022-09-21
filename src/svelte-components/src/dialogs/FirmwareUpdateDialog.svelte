<script lang="ts">
    import * as api from "$lib/api";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { delay } from "$lib/util";
    import Dialog, { Title, Content } from "@smui/dialog";
    import dayjs, { Dayjs } from "dayjs";
    import duration from "dayjs/plugin/duration";
    import { onDestroy, onMount } from "svelte";
    import { showDialog } from "./DialogHost.svelte";

    dayjs.extend(duration);

    export let open = false;
    export let action: "updateToLatest" | "updateToFile";
    export let file: File = undefined;

    let interval;
    let startTime: Dayjs;
    let elapsedTime;

    $: if (open) {
        startTime = dayjs();
        doFirmwareUpdate();
    }

    onMount(() => {
        interval = setInterval(() => {
            elapsedTime = dayjs
                .duration(dayjs().diff(startTime))
                .format("mm:ss");
        });
    });

    onDestroy(() => {
        clearInterval(interval);
    });

    async function doFirmwareUpdate() {
        ControllerMethods.dispatch("firmware-update");
        ControllerMethods.dispatch("close-menu");

        await delay(1000);

        try {
            switch (action) {
                case "updateToLatest":
                    await api.PUT("upgrade");
                    break;

                case "updateToFile":
                    const form = new FormData();
                    form.append("firmware", file);
                    await api.PUT("firmware/update", form);
                    break;

                default:
                    throw new Error(`Unrecognized action: ${action}`);
            }
        } catch (error) {
            open = false;
            showDialog("Message", {
                title: "Update failed",
                message: "Firmware update failed",
            });
        }
    }
</script>

<div class="firmware-update-dialog">
    <Dialog
        bind:open
        scrimClickAction=""
        escapeKeyAction=""
        aria-labelledby="firmware-update-dialog-title"
        aria-describedby="firmware-update-dialog-content"
    >
        <Title id="firmware-update-dialog-title">Updating firmware</Title>

        <Content id="firmware-update-dialog-content" tabindex="0">
            <h3>Please wait...</h3>

            <p>
                This process should take less than 5 minutes. If it takes longer
                than this, please restart the controller and try via USB.
            </p>

            <p style="text-align: right;">Time elapsed: {elapsedTime}</p>
        </Content>
    </Dialog>
</div>

<style lang="scss">
    :global .firmware-update-dialog {
        .mdc-dialog__scrim {
            background-color: rgba(0, 0, 0, 0.75);
        }
    }
</style>
