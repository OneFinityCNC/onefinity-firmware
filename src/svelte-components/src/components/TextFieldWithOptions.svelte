<script lang="ts">
    import TextField from "@smui/textfield";
    import Icon from "@smui/textfield/icon";
    import HelperText from "@smui/textfield/helper-text";
    import MenuSurface, {
        type MenuSurfaceComponentDev,
    } from "@smui/menu-surface";
    import List, { Item, Text } from "@smui/list";
    import { virtualKeyboardChange } from "$lib/CustomActions";
    import { onDestroy } from "svelte";

    let menuSurface: MenuSurfaceComponentDev;
    let menuTimeout;
    let optionSelected: boolean = false;

    export let value: string;
    export let options: string[][];
    export let valid: boolean;
    export let helperText: string;

    onDestroy(() => {
        if (menuTimeout) {
            clearTimeout(menuTimeout);
            menuTimeout = undefined;
        }
    });

    function showMenu(show: boolean) {
        if (show && optionSelected) {
            return;
        }

        optionSelected = false;

        if (menuTimeout) {
            clearTimeout(menuTimeout);
        }

        // Use a timeout to "debounce" the display of the menu.
        menuTimeout = setTimeout(() => menuSurface.setOpen(show), 100);
    }
</script>

<div class="textfield-with-options">
    <TextField
        bind:value
        on:focusin={() => showMenu(true)}
        on:focusout={() => showMenu(false)}
        use={[[virtualKeyboardChange, (newValue) => (value = newValue)]]}
        {...$$restProps}
    >
        <div slot="trailingIcon">
            {#if valid}
                <Icon class="fa fa-check-circle-o" style="color: green;" />
            {/if}
        </div>
        <HelperText persistent slot="helper">{helperText}</HelperText>
    </TextField>

    <MenuSurface bind:this={menuSurface} anchorCorner="BOTTOM_LEFT">
        <div style="display: flex; flex-direction: row;">
            {#each options as group}
                <List>
                    {#each group as option}
                        <Item
                            on:SMUI:action={() => {
                                value = option;
                                showMenu(false);

                                optionSelected = true;
                            }}
                        >
                            <Text>{option}</Text>
                        </Item>
                    {/each}
                </List>
            {/each}
        </div>
    </MenuSurface>
</div>

<style lang="scss">
    :global {
        .textfield-with-options {
            .mdc-deprecated-list-item {
                height: 32px;
            }
        }
    }
</style>
