<script lang="ts">
    import Dialog, { Title, Actions, InitialFocus } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import * as Api from "$lib/api";

    export let open;

    function shutdown() {
        Api.PUT("shutdown");
    }

    function restart() {
        Api.PUT("reboot");
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="shutdown-dialog-title"
    aria-describedby="shutdown-dialog-content"
>
    <Title id="shutdown-dialog-title">Confirm Shutdown?</Title>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>

        <Button on:click={shutdown}>
            <Label>Shutdown</Label>
        </Button>

        <Button use={[InitialFocus]} on:click={restart}>
            <Label>Restart</Label>
        </Button>
    </Actions>
</Dialog>
