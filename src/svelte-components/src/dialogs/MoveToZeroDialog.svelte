<script lang="ts">
    import Dialog, { Title, Actions, InitialFocus } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";

    export let open;
    export let axes: "xy" | "z" | "a";
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="move-to-zero-dialog-title"
    aria-describedby="move-to-zero-dialog-content"
>
    <Title id="move-to-zero-dialog-title">
        Move to {(axes || "").toUpperCase()} origin?
    </Title>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>

        <Button
            defaultAction
            use={[InitialFocus]}
            on:click={() => ControllerMethods.gotoZero(axes)}
        >
            <Label>Confirm</Label>
        </Button>
    </Actions>
</Dialog>
