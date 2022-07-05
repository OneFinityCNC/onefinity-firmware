<script lang="ts">
  import Dialog, { Title, Content, Actions, InitialFocus } from "@smui/dialog";
  import Button, { Label } from "@smui/button";

  export let open;
  export let home: () => any;
</script>

<Dialog
  bind:open
  aria-labelledby="simple-title"
  aria-describedby="simple-content"
>
  <Title id="simple-title">Home Machine</Title>

  <Content id="simple-content">Home the machine?</Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>

    <Button defaultAction use={[InitialFocus]} on:click={home}>
      <Label>OK</Label>
    </Button>
  </Actions>
</Dialog>
