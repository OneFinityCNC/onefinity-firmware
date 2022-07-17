<script lang="ts">
  import Dialog, { Title, Content, Actions, InitialFocus } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import TextField from "@smui/textfield";
  import Icon from "@smui/textfield/icon";
  import HelperText from "@smui/textfield/helper-text";
  import MessageDialog from "$dialogs/MessageDialog.svelte";
  import type { WifiNetwork } from "$lib/NetworkInfo";
  import * as api from "$lib/api";

  export let open = false;
  export let network: WifiNetwork;

  let rebooting = false;
  let password = "";
  let showPassword = false;

  $: needPassword = !network?.active && network?.Encryption !== "Open";
  $: connectOrDisconnect = network?.active ? "Disconnect" : "Connect";
  $: connectToOrDisconnectFrom = network?.active
      ? "Disconnect from"
      : "Connect to";

  $: if (open) {
    password = "";
  }

  async function onConfirm() {
    rebooting = true;

    await api.PUT("network", {
      wifi: {
        enabled: !network.active,
        ssid: network.Name,
        password,
      },
    });
  }
</script>

<MessageDialog open={rebooting} title="Rebooting">
  Rebooting to apply Wifi changes...
</MessageDialog>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="wifi-connection-dialog-title"
  aria-describedby="wifi-connection-dialog-content"
>
  <Title id="wifi-connection-dialog-title">{connectToOrDisconnectFrom} {network.Name}</Title>

  <Content id="wifi-connection-dialog-content">
    {#if needPassword}
      <TextField
        bind:value={password}
        label="Password"
        spellcheck="false"
        variant="filled"
        type={showPassword ? "text" : "password"}
        style="width: 100%;"
      >
        <div
          slot="trailingIcon"
          on:click={() => (showPassword = !showPassword)}
        >
          <Icon class="material-symbols-outlined">
            {showPassword ? "password" : "abc"}
          </Icon>
        </div>
        <HelperText persistent slot="helper">
          Wifi passwords must be 8 to 128 characters
        </HelperText>
      </TextField>
    {/if}

    <p>
      <em>
        Clicking {connectOrDisconnect} will reboot the controller to apply the changes.
      </em>
    </p>
  </Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>

    <Button
      defaultAction
      use={[InitialFocus]}
      on:click={onConfirm}
      disabled={needPassword && (password.length < 8 || password.length > 128)}
    >
      <Label>{connectOrDisconnect} & Reboot</Label>
    </Button>
  </Actions>
</Dialog>
