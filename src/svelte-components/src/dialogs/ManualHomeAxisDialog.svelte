<script lang="ts">
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import TextField from "@smui/textfield";
  import Button, { Label } from "@smui/button";
  import { ControllerMethods } from "$lib/RegisterControllerMethods";
  import { virtualKeyboardChangeHelper } from "$lib/customActions";

  export let open: boolean;
  export let axis = "";

  let value = 0;

  function onConfirm() {
    ControllerMethods.set_home(axis, value);
  }
</script>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="manual-home-axis-dialog-title"
  aria-describedby="manual-home-axis-dialog-content"
>
  <Title id="manual-home-axis-dialog-title"
    >Manually Home {axis.toUpperCase()} Axis</Title
  >
  <Content id="manual-home-axis-dialog-content">
    <p>Set axis absolute position</p>

    <TextField
      label="Absolute"
      type="number"
      bind:value
      use={[[virtualKeyboardChangeHelper, (newValue) => (value = newValue)]]}
      variant="filled"
      style="width: 100%;"
    />
  </Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>
    <Button defaultAction on:click={onConfirm}>
      <Label>Set</Label>
    </Button>
  </Actions>
</Dialog>
