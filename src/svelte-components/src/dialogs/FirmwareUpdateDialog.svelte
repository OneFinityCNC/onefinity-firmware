<script lang="ts">
    import * as api from "$lib/api";
    import LinearProgress from "@smui/linear-progress";
    import { getLatestFirmwareVersion } from "$lib/Firmware";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { delay, humanFileSize } from "$lib/util";
    import Dialog, { Title, Content, Actions } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import dayjs, { Dayjs } from "dayjs";
    import duration from "dayjs/plugin/duration";
    import { onDestroy, onMount } from "svelte";
    import { showDialog } from "./DialogHost.svelte";
    import { firmwareDownload } from "$lib/ControllerState";

    dayjs.extend(duration);

    export let open = false;
    export let action: "updateToLatest" | "updateToFile";
    export let file: File = undefined;

    let interval;
    let startTime: Dayjs;
    let elapsedTime;
    let downloading = false;
    let downloadingMessage = "";
    let downloadProgress = 0;
    let installing = false;

    $: if (open) {
        ControllerMethods.dispatch("firmware-update", true);
        ControllerMethods.dispatch("close-menu");

        downloading = false;
        installing = false;
        downloadProgress = 0;
        downloadingMessage = "Downloading...";
        startTime = dayjs();
        doFirmwareUpdate();
    } else {
        ControllerMethods.dispatch("firmware-update", false);
    }

    $: if ($firmwareDownload.complete) {
        downloading = false;
        installing = true;
    }

    $: if ($firmwareDownload.failed) {
        downloading = false;
        installing = false;
    }

    $: if ($firmwareDownload.size) {
        const { size, bytes } = $firmwareDownload;
        const sizeHuman = humanFileSize($firmwareDownload.size);
        const bytesHuman = humanFileSize($firmwareDownload.bytes);
        downloadingMessage = `Downloading... (${bytesHuman} of ${sizeHuman})`;

        downloadProgress = bytes / size;
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
        try {
            switch (action) {
                case "updateToLatest":
                    downloading = true;
                    await delay(1000);
                    await api.PUT("upgrade", {
                        version: getLatestFirmwareVersion(),
                    });
                    break;

                case "updateToFile":
                    installing = true;
                    const form = new FormData();
                    form.append("firmware", file);
                    await api.PUT("firmware/update", form);
                    break;

                default:
                    throw new Error(`Unrecognized action: ${action}`);
            }
        } catch (error) {
            open = false;
            console.log("Error during firmware update", error);
            showDialog("Message", {
                title: "Update failed",
                message: "Firmware update failed",
            });
        }
    }

    async function cancelDownload() {
        await api.PUT("upgrade", { cancel: true });
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
            {#if $firmwareDownload.failed}
                <p>The new firmware could not be downloaded.</p>
                <p>
                    If this problem persists, you can use a computer to download
                    the update to a USB thumb drive, and use the "Upgrade via
                    File" option.
                </p>
            {:else}
                {#if downloading}
                    <p>{downloadingMessage}</p>
                    <LinearProgress progress={downloadProgress} />
                {/if}

                {#if installing}
                    <p>Installing...</p>
                {/if}

                <p class="tip">
                    This process should take less than 5 minutes. If it takes
                    longer than this, please restart the controller and try via
                    USB.
                </p>

                <p style="text-align: right;">Time elapsed: {elapsedTime}</p>
            {/if}
        </Content>

        {#if downloading || $firmwareDownload.failed}
            <Actions>
                <Button on:click={cancelDownload}>
                    <Label>Cancel</Label>
                </Button>
            </Actions>
        {/if}
    </Dialog>
</div>

<style lang="scss">
    :global .firmware-update-dialog {
        .mdc-dialog__scrim {
            background-color: rgba(0, 0, 0, 0.75);
        }

        .tip {
            font-style: italic;
            font-size: 90%;
            line-height: 1.5;
        }
    }
</style>
