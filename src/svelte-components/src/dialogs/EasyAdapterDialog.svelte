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
>
    <Title id="easy-adapter-dialog-title">Configuring Easy Adapter</Title>

    <Content id="easy-adapter-dialog-content">This will take ~90 seconds to complete. Please wait until the process is complete.</Content>
</Dialog>
