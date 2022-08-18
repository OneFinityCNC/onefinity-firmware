<script lang="ts">
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import TextField from "@smui/textfield";
  import MessageDialog from "$dialogs/MessageDialog.svelte";
  import * as api from "$lib/api";
  import { virtualKeyboardChange } from "$lib/CustomActions";

  // https://man7.org/linux/man-pages/man7/hostname.7.html
  //
  // Each element of the hostname must be from 1 to 63 characters long
  // and the entire hostname, including the dots, can be at most 253
  // characters long.  Valid characters for hostnames are ASCII(7)
  // letters from a to z, the digits from 0 to 9, and the hyphen (-).
  // A hostname may not start with a hyphen.

  const pattern = /[a-zA-Z0-9][a-zA-Z0-9-]{0,62}/;

  export let open = false;

  let rebooting = false;
  let redirectTimeout = 45;
  let hostname = "";

  $: setTimeout(() => {
    hostname = (hostname.match(pattern) || [""])[0].toLowerCase();
  }, 0);

  $: if (open) {
    hostname = "";
  }

  async function onConfirm() {
    rebooting = true;
    await api.PUT("hostname", { hostname });
    await api.PUT("reboot");

    const interval = setInterval(() => {
      if (0 < redirectTimeout) {
        redirectTimeout -= 1;
      } else {
        clearInterval(interval);
        location.hostname = getRedirectTarget();
      }
    }, 1000);
  }

  function getRedirectTarget() {
    if (location.hostname.endsWith(".local")) {
      return `${hostname}.local`;
    }

    if (location.hostname.endsWith(".lan")) {
      return `${hostname}.lan`;
    }

    return hostname;
  }
</script>

<MessageDialog open={rebooting} title="Rebooting">
  Rebooting to apply the hostname change...
</MessageDialog>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="change-hostname-dialog-title"
  aria-describedby="change-hostname-dialog-content"
>
  <Title id="change-hostname-dialog-title">Change Hostname</Title>

  <Content id="change-hostname-dialog-content">
    <TextField
      bind:value={hostname}
      use={[[virtualKeyboardChange, (newValue) => (hostname = newValue)]]}
      label="New Hostname"
      spellcheck="false"
      variant="filled"
      style="width: 100%;"
    />
  </Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>
    <Button defaultAction on:click={onConfirm} disabled={hostname.length === 0}>
      <Label>Confirm & Reboot</Label>
    </Button>
  </Actions>
</Dialog>
