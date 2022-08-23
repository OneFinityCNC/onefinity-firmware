<script lang="ts">
  import TextField from "@smui/textfield";
  import Select, { Option } from "@smui/select";
  import type { MenuComponentDev } from "@smui/menu";
  import Menu from "@smui/menu";
  import List, { Item, Text } from "@smui/list";
  import { onMount } from "svelte";
  import { set_input_value } from "svelte/internal";

  let menu: MenuComponentDev;

  type Option = {
    value: number;
    label: string;
    metric: boolean;
  };

  export let label: string;
  export let value: number;
  export let metric: boolean;
  export let options: Option[];

  let textValue = "";

  $: if (textValue) {
    value = Number.parseFloat(textValue) || null;
  }

  onMount(() => {
    textValue = value?.toString() || "";
  });

  function onOptionSelected(option: Option) {
    textValue = option.value.toString();
    metric = option.metric;
  }

  function filterKeys(event) {
    const input = event.target;

    if (input.value.match(/[^0-9.]/)) {
      input.value = input.value.replace(/[^0-9.]/g, "");
    }

    if (input.value.match(/\.[^.]*\./)) {
      input.value = input.value.replace(/(\.[^.]*)\./g, "$1");
    }
  }
</script>

<div>
  <div class="value-and-unit">
    <TextField
      {label}
      on:keypress={filterKeys}
      on:keyup={filterKeys}
      bind:value={textValue}
      on:click={() => menu.setOpen(true)}
    />
    <Select bind:value={metric}>
      <Option value={true}>mm</Option>
      <Option value={false}>in</Option>
    </Select>
  </div>
  <Menu bind:this={menu} anchorCorner="BOTTOM_LEFT">
    <List>
      {#each options as option}
        <Item on:SMUI:action={() => onOptionSelected(option)}>
          <Text>{option.label}</Text>
        </Item>
      {/each}
    </List>
  </Menu>
</div>

<style lang="scss">
  :global {
    .value-and-unit {
      display: flex;
      column-gap: 10px;

      .mdc-select {
        max-width: 60px;
      }

      .smui-select--standard .mdc-select__dropdown-icon {
        margin-left: 0;
      }
    }
  }
</style>