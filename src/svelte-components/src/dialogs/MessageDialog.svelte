<script lang="ts">
  import Dialog, { Title, Content, Actions, InitialFocus } from "@smui/dialog";
  import Button, { Label } from "@smui/button";

  export let open: boolean;
  export let title = "";
  export let message = "";
  export let noaction = false;
</script>

<Dialog
  bind:open
  scrimClickAction=""
  escapeKeyAction=""
  aria-labelledby="message-dialog-title"
  aria-describedby="message-dialog-content"
>
  <Title id="message-dialog-title">{title}</Title>

  <Content id="message-dialog-content">
    <slot>{message}</slot>
  </Content>

  {#if !noaction}
    <Actions>
      <Button defaultAction use={[InitialFocus]}>
        <Label>OK</Label>
      </Button>
    </Actions>
  {/if}
</Dialog>
