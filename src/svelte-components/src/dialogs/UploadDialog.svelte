<script lang="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import LinearProgress from "@smui/linear-progress";

    export let open = false;
    export let file: File;
    export let onComplete: () => void;

    let wasOpen = false;
    let xhr;
    let progress;

    $: if (open != wasOpen) {
        if (!wasOpen) {
            beginUpload();
        }

        wasOpen = open;
    }

    $: if (!open) {
        xhr = undefined;
    }

    async function beginUpload() {
        progress = 0;

        xhr = new XMLHttpRequest();
        xhr.upload.onload = () => {
            open = false;
            if (onComplete) {
                onComplete();
            }
        };

        xhr.upload.onerror = () => {
            open = false;
            alert("Upload failed.");
        };

        xhr.upload.onabort = () => {
            open = false;
        };

        xhr.upload.onprogress = (event) => {
            progress = event.loaded / event.total;
        };

        xhr.open("PUT", `/api/file/${encodeURIComponent(file.name)}`);
        xhr.send(file);
    }

    function onCancel() {
        xhr.abort();
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="upload-dialog-title"
    aria-describedby="upload-dialog-content"
>
    <Title id="upload-dialog-title">
        Uploading {#if file}{file.name}...{/if}
    </Title>

    <Content id="upload-dialog-content">
        <LinearProgress {progress} />
    </Content>

    <Actions>
        <Button on:click={onCancel} use={[InitialFocus]}>
            <Label>Cancel</Label>
        </Button>
    </Actions>
</Dialog>
