<script lang="ts">
    import configTemplate from "../../../resources/config-template.json";
    import { Config, DisplayUnits } from "$lib/ConfigStore";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { onMount } from "svelte";

    type ValueType =
        | string
        | number
        | { title: string; value: string | number };

    type Template = {
        type?: string;
        values?: Array<ValueType>;
        unit?: "string";
        iunit?: "string";
        min?: number;
        max?: number;
        step?: number;
        help?: string;
        default?: string | number;
        scale?: number;
    };

    const namesByKey = {
        "gamepad-default-type": "Default type",
        "probing-prompts": "Show safety prompts",
        "probe-xdim": "Probe block width",
        "probe-ydim": "Probe block length",
        "probe-zdim": "Probe block height",
        "probe-fast-seek": "Fast seek speed",
        "probe-slow-seek": "Slow seek speed",
        "program-start": "On program start",
        "tool-change": "On tool change",
        "program-end": "On program end",
        "max-deviation": "Maximum deviation",
        "junction-accel": "Junction acceleration",
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
        name = namesByKey[name] || name;
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
        const help = (!!template.help) ? `${template.help}\n` : "";
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

    function onChange(event) {
        Config.update((config) => {
            let target = config;
            for (const part of keyParts.slice(0, -1)) {
                target = target[part];
            }

            const value = getValueFromElement(event.target);
            target[keyParts[keyParts.length - 1]] = value;

            return config;
        });

        ControllerMethods.dispatch("config-changed");
    }

    function getValueFromElement(element) {
        switch (template.type) {
            case "float":
            case "int":
                return Number(element.value);

            case "bool":
                return element.checked;

            default:
                return element.value;
        }
    }

    function getOptionValue(opt: ValueType) {
        switch (typeof opt) {
            case "object":
                return opt.value || opt;

            default:
                return opt;
        }
    }

    function getOptionTitle(opt: ValueType) {
        switch (typeof opt) {
            case "object":
                return opt.title || opt;

            default:
                return opt;
        }
    }
</script>

{#if template}
    <div class="pure-control-group" {title}>
        <label for={name}>{name}</label>

        {#if template.values}
            <select {name} bind:value on:change={onChange}>
                {#each template.values as opt}
                    <option
                        value={getOptionValue(opt)}
                        disabled={opt === "-----"}
                    >
                        {getOptionTitle(opt)}
                    </option>
                {/each}
            </select>
        {:else if template.type === "bool"}
            <input
                {name}
                type="checkbox"
                checked={value}
                on:change={onChange}
            />
        {:else if template.type === "float"}
            <input
                {name}
                type="number"
                min={template.min}
                max={template.max}
                step={template.step || "any"}
                bind:value
                on:keyup={onChange}
            />
        {:else if template.type === "int"}
            <input
                {name}
                type="number"
                min={template.min}
                max={template.max}
                bind:value
                on:keyup={onChange}
            />
        {:else if template.type === "string"}
            <input {name} type="text" bind:value on:keyup={onChange} />
        {:else if template.type == "text"}
            <textarea {name} bind:value on:keyup={onChange} />
        {/if}

        <label for="" class="units">{units || ""}</label>

        <slot name="extra" />
    </div>
{/if}
