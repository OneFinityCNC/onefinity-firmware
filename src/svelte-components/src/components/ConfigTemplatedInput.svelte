<script lang="ts">
    import configTemplate from "../../../resources/config-template.json";
    import { Config, DisplayUnits } from "$lib/ConfigStore";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { onMount } from "svelte";

    type Template = {
        type?: string;
        values?: (string | number)[];
        unit?: "string";
        iunit?: "string";
        min?: number;
        max?: number;
        step?: number;
        help?: string;
        default?: string | number;
        scale?: number;
    };

    export let key: string;
    let keyParts: string[];
    let template: Template;
    let name: string;
    let title: string;
    let units: string;
    let value;

    onMount(() => {
        keyParts = (key || "").split(".");
        template = getTemplate();
        name = keyParts[keyParts.length - 1];
        title = getTitle();
        value = getValue();
    });

    $: metric = $DisplayUnits === "METRIC";
    $: if (template) {
        units = metric || !template.iunit ? template.unit : template.iunit;
    }

    function getTemplate(): Template {
        let template = configTemplate;
        for (const part of keyParts) {
            template = template[part];
        }

        return template as Template;
    }

    function getTitle(): string {
        const help = template.help ? `${template.help}\n` : "";
        return `${help}Default: ${template.default} ${template.unit || ""}`;
    }

    function getValue(): string | number {
        let value: any = $Config;
        for (const part of keyParts) {
            value = value[part];
        }

        if (template.scale) {
            if (metric) {
                return Number.parseFloat(value.toFixed(3));
            }

            return Number.parseFloat((value / template.scale).toFixed(4));
        }

        return value;
    }

    function onChange() {
        Config.update((config) => {
            let target = config;
            for (const part of keyParts.slice(0, -1)) {
                target = target[part];
            }

            target[keyParts[keyParts.length - 1]] = value;

            return config;
        });

        ControllerMethods.dispatch("config-changed");
    }
</script>

{#if template}
    <div class="pure-control-group" {title}>
        <label for={name}>{name}</label>

        {#if template.values}
            <select {name} bind:value on:change={onChange}>
                {#each template.values as opt}
                    <option value={opt} disabled={opt === "-----"}>
                        {opt}
                    </option>
                {/each}
            </select>
        {:else if template.type === "bool"}
            <input {name} type="checkbox" bind:value on:input={onChange} />
        {:else if template.type === "float"}
            <input
                {name}
                type="number"
                min={template.min}
                max={template.max}
                step={template.step || "any"}
                bind:value
                on:input={onChange}
            />
        {:else if template.type === "int"}
            <input
                {name}
                type="number"
                min={template.min}
                max={template.max}
                bind:value
                on:input={onChange}
            />
        {:else if template.type === "string"}
            <input {name} type="text" bind:value on:input={onChange} />
        {:else if template.type == "text"}
            <textarea {name} bind:value on:input={onChange} />
        {/if}

        <label for="" class="units">{units || ""}</label>

        <slot name="extra" />
    </div>
{/if}
