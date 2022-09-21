<script type="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import Radio from "@smui/radio";
    import FormField from "@smui/form-field";
    import * as Api from "$lib/api";
    import { onMount } from "svelte";
    import { showDialog } from "./DialogHost.svelte";

    const options = [
        { value: 0, label: "Normal" },
        { value: 1, label: "Upside-down" },
    ];

    export let open;
    let currentValue;
    let value;

    onMount(async () => {
        const result = await Api.GET("screen-rotation");
        currentValue = value = result.rotated ? 1 : 0;
    });

    async function onConfirm() {
        showDialog("Message", {
            title: "Rebooting",
            message: "Rebooting to apply the new screen rotation...",
            noaction: true,
        });

        await Api.PUT("screen-rotation", { rotated: value === 1 });
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="screen-rotation-dialog-title"
    aria-describedby="screen-rotation-dialog-content"
>
    <Title id="screen-rotation-dialog-title">Screen Rotation</Title>

    <Content id="screen-rotation-dialog-content">
        {#each options as option}
            <FormField>
                <Radio bind:group={value} value={option.value} />
                <span slot="label">
                    {option.label}
                </span>
            </FormField>
        {/each}
    </Content>

    <Actions>
        <Button use={[InitialFocus]}>
            <Label>Cancel</Label>
        </Button>
        <Button
            defaultAction
            disabled={value === currentValue}
            on:click={onConfirm}
        >
            <Label>Confirm & Reboot</Label>
        </Button>
    </Actions>
</Dialog>

<style lang="scss">
    :global {
        #screen-rotation-dialog-content {
            display: flex;
            flex-direction: column;
        }
    }
</style>
