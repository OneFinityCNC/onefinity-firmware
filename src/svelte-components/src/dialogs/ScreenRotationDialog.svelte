<script type="ts">
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import Radio from "@smui/radio";
  import FormField from "@smui/form-field";
  import MessageDialog from "$dialogs/MessageDialog.svelte";
  import * as Api from "$lib/api";
  import { onMount } from "svelte";

  const options = [
    { value: 0, label: "Normal" },
    { value: 1, label: "Upside-down" },
  ];

  export let open;
  let currentValue;
  let value;
  let rebooting;

  onMount(async () => {
    const result = await Api.GET("screen-rotation");
    currentValue = value = result.rotated ? 1 : 0;
  });

  async function onConfirm() {
    rebooting = true;

    await Api.PUT("screen-rotation", { rotated: value === 1 });
  }
</script>

<MessageDialog open={rebooting} title="Rebooting">
  Rebooting to apply the new screen rotation...
</MessageDialog>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="screen-rotation-title"
  aria-describedby="screen-rotation-content"
>
  <Title id="screen-rotation-title">Screen Rotation</Title>

  <Content id="screen-rotation-content">
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
    <Button>
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
    #screen-rotation-content {
      display: flex;
      flex-direction: column;
    }
  }
</style>
