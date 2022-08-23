<script lang="ts">
  import Dialog, { Title, Content, Actions, InitialFocus } from "@smui/dialog";
  import Button, { Label } from "@smui/button";

  export let open;
  export let home: () => any;
</script>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="home-machine-dialog-title"
  aria-describedby="home-machine-dialog-content"
>
  <Title id="home-machine-dialog-title">Home Machine</Title>

  <Content id="home-machine-dialog-content">Home the machine?</Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>

    <Button defaultAction use={[InitialFocus]} on:click={home}>
      <Label>OK</Label>
    </Button>
  </Actions>
</Dialog>
