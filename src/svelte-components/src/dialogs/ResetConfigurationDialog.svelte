<script lang="ts">
    import Dialog, { Title, Content, Actions } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import Radio from "@smui/radio";
    import FormField from "@smui/form-field";
    import * as api from "$lib/api";
    import merge from "lodash.merge";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import config_defaults from "../../../resources/onefinity_defaults.json";
    import machinist_x35 from "../../../resources/onefinity_machinist_x35_defaults.json";
    import woodworker_x35 from "../../../resources/onefinity_woodworker_x35_defaults.json";
    import woodworker_x50 from "../../../resources/onefinity_woodworker_x50_defaults.json";
    import journeyman_x50 from "../../../resources/onefinity_journeyman_x50_defaults.json";
    import { showDialog } from "./DialogHost.svelte";

    const options = [
        {
            value: machinist_x35,
            title: "Machinist X-35",
        },
        {
            value: woodworker_x35,
            title: "Woodworker X-35",
        },
        {
            value: woodworker_x50,
            title: "Woodworker X-50",
        },
        {
            value: journeyman_x50,
            title: "Journeyman X-50",
        },
    ];

    export let open;

    let selected;

    $: if (open) {
        selected = undefined;
    }

    async function onConfirm() {
        try {
            await api.PUT("config/save", merge({}, config_defaults, selected));
            ControllerMethods.dispatch("update");

            showDialog("Message", {
                title: "Success",
                message: "Configuration restored",
            });
        } catch (error) {
            console.error("Restore failed:", error);
            alert("Restore failed");
        }
    }
</script>

<Dialog
    bind:open
    scrimClickAction=""
    aria-labelledby="reset-configuration-dialog-title"
    aria-describedby="reset-configuration-dialog-content"
>
    <Title id="reset-configuration-dialog-title">Reset Configuration</Title>

    <Content id="reset-configuration-dialog-content">
        <i>Non-network configuration changes will be lost.</i>

        <p>Select your machine type:</p>

        <div class="reset-config-variants">
            {#each options as option}
                <FormField>
                    <Radio bind:group={selected} value={option.value} />
                    <span slot="label">{option.title}</span>
                </FormField>
            {/each}
        </div>
    </Content>

    <Actions>
        <Button>
            <Label>Cancel</Label>
        </Button>
        <Button defaultAction on:click={onConfirm} disabled={!selected}>
            <Label>Reset</Label>
        </Button>
    </Actions>
</Dialog>

<style lang="scss">
    :global .reset-config-variants {
        padding-left: 40px;
        display: flex;
        flex-direction: column;

        label {
            font-size: 16pt;
        }
    }
</style>
