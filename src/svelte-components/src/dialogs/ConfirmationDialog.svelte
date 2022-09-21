<script lang="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";

    export let open: boolean;
    export let title = "";
    export let message = "";
    export let confirmButtonTitle = "";
    export let onConfirm: () => void;
</script>

<Dialog
    bind:open
    scrimClickAction=""
    escapeKeyAction=""
    aria-labelledby="confirmation-dialog-title"
    aria-describedby="confirmation-dialog-content"
>
    <Title id="confirmation-dialog-title">{title}</Title>

    <Content id="confirmation-dialog-content">
        <slot>{message}</slot>
    </Content>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>
        <Button defaultAction use={[InitialFocus]} on:click={onConfirm}>
            <Label>{confirmButtonTitle || "OK"}</Label>
        </Button>
    </Actions>
</Dialog>
