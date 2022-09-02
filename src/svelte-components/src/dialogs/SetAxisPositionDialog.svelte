<script lang="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import TextField from "@smui/textfield";
    import Button, { Label } from "@smui/button";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { virtualKeyboardChange } from "$lib/CustomActions";

    export let open: boolean;
    export let axis = "";

    let value = 0;
    let homed = false;
    let wasOpen = false;

    $: if (open != wasOpen) {
        if (open) {
            homed = ControllerMethods.isAxisHomed(axis);
        }

        wasOpen = open;
    }

    function onUnhome() {
        ControllerMethods.unhome(axis);
    }

    function onConfirm() {
        ControllerMethods.set_position(axis, value);
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="set-axis-position-dialog-title"
    aria-describedby="set-axis-position-dialog-content"
>
    <Title id="set-axis-position-dialog-title">
        Set {axis.toUpperCase()} Axis Position
    </Title>

    <Content id="set-axis-position-dialog-content">
        <TextField
            label="Position"
            type="number"
            bind:value
            use={[
                InitialFocus,
                [virtualKeyboardChange, (newValue) => (value = newValue)],
            ]}
            spellcheck="false"
            variant="filled"
            style="width: 100%;"
        />
    </Content>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>
        {#if homed}
            <Button on:click={onUnhome}>
                <Label>Unhome</Label>
            </Button>
        {/if}
        <Button defaultAction on:click={onConfirm}>
            <Label>Set</Label>
        </Button>
    </Actions>
</Dialog>
