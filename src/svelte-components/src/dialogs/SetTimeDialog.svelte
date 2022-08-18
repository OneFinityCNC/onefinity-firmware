<script lang="ts">
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import TextField from "@smui/textfield";
  import CircularProgress from "@smui/circular-progress";
  import VirtualList from "svelte-tiny-virtual-list";
  import * as api from "$lib/api";
  import { virtualKeyboardChangeHelper } from "$lib/customActions";

  const itemHeight = 35;

  type Timezone = {
    label: string;
    value: string;
  };

  export let open = false;
  let value = "";
  let wasOpen = false;
  let loading = true;
  let timezones: Timezone[] = [];
  let currentTimezoneIndex: number;
  let selectedTimezoneIndex: number;
  let networkTimeSynchronized: boolean;

  $: if (open != wasOpen) {
    if (!wasOpen) {
      loadData();
    }

    wasOpen = open;
  }

  async function loadData() {
    loading = true;

    const result = await api.GET("time");

    parseTimezones(result.timezones);
    parseTimeinfo(result.timeinfo);
    value = getDateTimeValueString();

    loading = false;
  }

  function parseTimeinfo(str: string) {
    const matches = Array.from(str.matchAll(/\s*([^:]+):\s+(.+)/gm));

    let currentTimezoneValue;
    for (const match of matches) {
      let [, label, value] = match;

      switch (label) {
        case "Time zone":
          currentTimezoneValue = value.split(" ")[0];
          break;

        case "NTP synchronized":
          networkTimeSynchronized = value === "yes";
          break;
      }
    }

    currentTimezoneIndex = timezones.findIndex(
      (tz) => tz.value === currentTimezoneValue
    );
    selectedTimezoneIndex = currentTimezoneIndex;
  }

  function parseTimezones(str: string) {
    const matches = Array.from(str.matchAll(/\s*(\S+)\s*/gm));

    timezones = [];
    for (let [, value] of matches) {
      timezones.push({
        label: value.replace(/_/g, " "),
        value,
      });
    }

    // Sort alphabetically, but with the current timezone at the top of the list
    timezones.sort((a, b) => {
      switch (true) {
        case a.value === "UTC":
          return -1;

        case b.value === "UTC":
          return 1;

        default:
          return a.value.localeCompare(b.value);
      }
    });
  }

  function getDateTimeValueString() {
    const date = new Date();

    const year = date.getFullYear().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");

    return `${year}-${month}-${day}T${hour}:${minute}:00`;
  }

  async function onConfirm() {
    const date = new Date(value);
    const year = date.getFullYear().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");

    await api.PUT("time", {
      datetime: `${year}-${month}-${day} ${hour}:${minute}:00`,
      timezone: timezones[selectedTimezoneIndex].value,
    });
  }
</script>

<Dialog
  bind:open
  scrimClickAction=""
  aria-labelledby="set-time-dialog-title"
  aria-describedby="set-time-dialog-content"
>
  <Title id="set-time-dialog-title">Adjust Clock & Timezone</Title>

  <Content id="set-time-dialog-content">
    {#if loading}
      <div style="display: flex; justify-content: center">
        <CircularProgress style="height: 32px; width: 32px;" indeterminate />
      </div>
    {:else}
      {#if networkTimeSynchronized}
        <p>
          Because this controller is connected to the internet, the time is
          managed automatically, and cannot be manually set.
        </p>
      {:else}
        <p>
          Because this controller is not connected to the internet, you can
          manually set the time.
        </p>

        <p>
          Note: any time the controller is turned off, the time will need to be
          reset. If you connect the controller to the internet, the time will be
          managed automatically.
        </p>

        <Label>Date & Time</Label>
        <TextField
          bind:value
          use={[
            [virtualKeyboardChangeHelper, (newValue) => (value = newValue)],
          ]}
          label="Time"
          type="datetime-local"
          variant="filled"
          style="width: 100%;"
        />
      {/if}

      <p>
        To display your local time correctly, the controller must know what
        timezone it is in.
      </p>

      <div class="timezones-container" style="margin-top: 20px;">
        <Label>Select your timezone</Label>
        <VirtualList
          width="100%"
          height={itemHeight * 6}
          itemCount={timezones.length}
          itemSize={itemHeight}
          scrollToIndex={currentTimezoneIndex}
          scrollToAlignment="center"
        >
          <div
            slot="item"
            let:index
            let:style
            {style}
            class="timezone"
            class:selected={index === selectedTimezoneIndex}
            on:click={() => (selectedTimezoneIndex = index)}
          >
            {timezones[index].label}
          </div>
        </VirtualList>
      </div>
    {/if}
  </Content>

  <Actions>
    <Button>
      <Label>Cancel</Label>
    </Button>
    <Button
      defaultAction
      disabled={selectedTimezoneIndex === -1}
      on:click={onConfirm}
    >
      <Label>Confirm</Label>
    </Button>
  </Actions>
</Dialog>

<style lang="scss">
  @use "sass:color";

  $primary: #0078e7;
  $very-dark: #555;
  $text: #777;
  $grey: #bbb;
  $light: #ddd;

  .timezones-container {
    :global {
      .virtual-list-wrapper {
        border: 1px solid #ccc;
        border-radius: 3px;
        overflow-x: hidden;
        overflow-y: scroll;
      }
    }
    .timezone {
      font-size: 14px;
      display: flex;
      align-items: center;
      margin: 0;
      padding-left: 10px;

      &.selected {
        color: $primary;
        background-color: color.adjust($primary, $lightness: 50%);
        font-weight: bold;
      }
    }
  }
</style>
