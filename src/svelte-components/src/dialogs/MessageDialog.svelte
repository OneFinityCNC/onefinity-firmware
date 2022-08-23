<script lang="ts">
  import Dialog, { Title, Content } from "@smui/dialog";

  export let open: boolean;
  export let title: string;
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
    <slot />
  </Content>
</Dialog>
