<script lang="ts">
    import Dialog, {
        Title,
        Content,
        Actions,
        InitialFocus,
    } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import TextField from "@smui/textfield";
    import Select, { Option } from "@smui/select";
    import CircularProgress from "@smui/circular-progress";
    import VirtualList from "svelte-tiny-virtual-list";
    import * as api from "$lib/api";
    import { virtualKeyboardChange } from "$lib/CustomActions";

    const itemHeight = 35;

    type Timezone = {
        label: string;
        value: string;
    };

    export let open = false;
    let year = "";
    let month = "";
    let day = "";
    let hour = "";
    let minute = "";
    let am = true;
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

        const date = new Date();
        year = date.getFullYear().toString();
        month = (date.getMonth() + 1).toString();
        day = date.getDate().toString();
        hour = date.getHours().toString();
        minute = date.getMinutes().toString();
        am = date.getHours() >= 12;

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
                    networkTimeSynchronized = false;
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

    async function onConfirm() {
        const YY = year.toString().padStart(2, "0");
        const MM = month.toString().padStart(2, "0");
        const DD = day.toString().padStart(2, "0");
        const hh = hour.toString().padStart(2, "0");
        const mm = minute.toString().padStart(2, "0");

        await api.PUT("time", {
            datetime: `${YY}-${MM}-${DD} ${hh}:${mm}:00`,
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
    <Title id="set-time-dialog-title">Change Time & Timezone</Title>

    <Content id="set-time-dialog-content">
        {#if loading}
            <div style="display: flex; justify-content: center">
                <CircularProgress
                    style="height: 32px; width: 32px;"
                    indeterminate
                />
            </div>
        {:else}
            {#if networkTimeSynchronized}
                <p>
                    Because this controller is connected to the internet, the
                    time is managed automatically, and cannot be manually set.
                </p>
            {:else}
                <p>
                    Any time the controller is turned off, the time will need to
                    be reset. If you connect the controller to the internet, the
                    time will be managed automatically.
                </p>

                <TextField
                    bind:value={year}
                    use={[
                        InitialFocus,
                        virtualKeyboardChange((v) => (year = v)),
                    ]}
                    label="Year"
                    type="number"
                    variant="filled"
                    style="width: 70px;"
                />
                <TextField
                    bind:value={month}
                    use={[virtualKeyboardChange((v) => (month = v))]}
                    label="Month"
                    type="number"
                    variant="filled"
                    style="width: 70px;"
                />
                <TextField
                    bind:value={day}
                    use={[virtualKeyboardChange((v) => (day = v))]}
                    label="Day"
                    type="number"
                    variant="filled"
                    style="width: 70px;"
                />

                <span style="display: inline-block; width: 20px;" />

                <TextField
                    bind:value={hour}
                    use={[virtualKeyboardChange((v) => (hour = v))]}
                    label="Hour"
                    type="number"
                    variant="filled"
                    style="width: 70px;"
                />
                <TextField
                    bind:value={minute}
                    use={[virtualKeyboardChange((v) => (minute = v))]}
                    label="Minute"
                    type="number"
                    variant="filled"
                    style="width: 70px;"
                />

                <Select
                    label=""
                    bind:value={am}
                    style="width: 90px;"
                    variant="filled"
                >
                    <Option value={true}>AM</Option>
                    <Option value={false}>PM</Option>
                </Select>
            {/if}

            <div class="timezones-container" style="margin-top: 30px;">
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
