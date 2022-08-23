<script lang="ts">
  import Dialog, { Title, Content } from "@smui/dialog";

  export let open: boolean;
  export let title: string;
</script>

<Dialog
  bind:open
  scrimClickAction=""
  escapeKeyAction=""
  aria-labelledby="simple-title"
  aria-describedby="simple-content"
>
  <Title id="simple-title">{title}</Title>
  <Content id="simple-content">
    <slot />
  </Content>
</Dialog>
