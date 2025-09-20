<script lang="ts">
    import Dialog, {
        Title,
        Content
    } from "@smui/dialog";

    export let open;
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="easy-adapter-dialog-title"
    aria-describedby="easy-adapter-dialog-content"
    class="easy-adapter-dialog"
>
    <Title id="easy-adapter-dialog-title">Configuring Easy Adapter</Title>

    <Content id="easy-adapter-dialog-content">This will take ~90 seconds to complete. Please wait until the process is complete.</Content>
</Dialog>

<style>
    :global(.easy-adapter-dialog.mdc-dialog) {
        z-index: 10000 !important;
    }
    
    :global(.easy-adapter-dialog .mdc-dialog__scrim) {
        z-index: 9999 !important;
    }
    
    :global(.easy-adapter-dialog .mdc-dialog__container) {
        z-index: 10001 !important;
    }
    
    :global(.easy-adapter-dialog .mdc-dialog__surface) {
        z-index: 10002 !important;
        width: 30vw !important;
        max-width: 50vw !important;
    }
    
    :global(.easy-adapter-dialog .mdc-dialog__content) {
        margin-top: 16px !important;
    }
</style>
