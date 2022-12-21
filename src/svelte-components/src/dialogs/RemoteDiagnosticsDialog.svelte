<script lang="ts">
    import * as api from "$lib/api";
    import TextField from "@smui/textfield";
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import { virtualKeyboardChange } from "$lib/CustomActions";

    export let open;

    let code = "";

    async function onContinue() {
        const url = `remote-diagnostics?command=connect&code=${code}`;
        const result = await api.GET(url);

        if (result.code === 401) {
            alert("The 6-digit code you provided was incorrect");
        } else {
            alert("Success!");
        }
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="remote-diagnostics-dialog-title"
    aria-describedby="remote-diagnostics-dialog-content"
>
    <Title id="remote-diagnostics-dialog-title">Remote Diagnostics</Title>

    <Content id="remote-diagnostics-dialog-content">
        <p>
            This feature enables remote diagnosis of customer issues. It
            requires a 6-digit code that is provided by Onefinity support during
            a live support session.
        </p>

        <TextField
            bind:value={code}
            label="6-digit code"
            type="number"
            variant="filled"
            invalid={code?.length !== 6}
            use={[InitialFocus, virtualKeyboardChange((v) => (code = v))]}
        />
    </Content>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>

        <Button
            defaultAction
            on:click={onContinue}
            disabled={code?.length !== 6}
        >
            <Label>Continue</Label>
        </Button>
    </Actions>
</Dialog>
