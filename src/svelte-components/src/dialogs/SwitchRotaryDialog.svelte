<script lang="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";

    export let open: boolean;
    export let isActive: boolean;
    export let switchMode: (mode: boolean) => any;
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="switch-rotary-dialog-title"
    aria-describedby="switch-rotary-dialog-content"
>
    <Title id="switch-rotary-dialog-title">Switch Rotary Mode</Title>

    <Content id="switch-rotary-dialog-content">
        {isActive ? "Turn on Rotary box?" : "Turn off Rotary box?"}
    </Content>

    <Actions>
        <Button>
            <Label>No</Label>
        </Button>

        <Button defaultAction use={[InitialFocus]} on:click={() =>switchMode(isActive)}>
            <Label>Yes</Label>
        </Button>
    </Actions>
</Dialog>
