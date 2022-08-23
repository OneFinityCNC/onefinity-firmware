<script lang="ts">
  import Dialog, { Title, Content, Actions, InitialFocus } from "@smui/dialog";
  import Button, { Label } from "@smui/button";

  export let open: boolean;
  export let msg: string;
</script>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="toolpath-message-dialog-title"
  aria-describedby="toolpath-message-dialog-content"
>
  <Title id="toolpath-message-dialog-title">{msg || ""}</Title>

  <Actions>
    <Button defaultAction use={[InitialFocus]}>
      <Label>OK</Label>
    </Button>
  </Actions>
</Dialog>
