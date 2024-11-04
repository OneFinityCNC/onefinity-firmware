<script lang="ts">
    import configTemplate from "../../../resources/config-template.json";
    import ScreenRotationDialog from "$dialogs/ScreenRotationDialog.svelte";
    import ConfigTemplatedInput from "./ConfigTemplatedInput.svelte";
    import SetTimeDialog from "$dialogs/SetTimeDialog.svelte";
    import Button, { Label } from "@smui/button";

    const gcodeURL = "https://linuxcnc.org/docs/html/gcode/g-code.html";

    let showScreenRotationDialog = false;
    let showSetTimeDialog = false;
</script>

<ScreenRotationDialog bind:open={showScreenRotationDialog} />
<!-- <SetTimeDialog bind:open={showSetTimeDialog} /> -->

<div class="settings-view">
    <h1>Settings</h1>

    <div class="pure-form pure-form-aligned">
        <h2>User Interface</h2>
        <fieldset>
            <div class="pure-control-group">
                <label for="screen-rotation" />
                <Button
                    name="screen-rotation"
                    touch
                    variant="raised"
                    on:click={() => (showScreenRotationDialog = true)}
                >
                    <Label>Change Screen Rotation</Label>
                </Button>
            </div>

            <!-- <div class="pure-control-group">
                <label for="set-time" />
                <Button
                    name="set-time"
                    touch
                    variant="raised"
                    on:click={() => (showSetTimeDialog = true)}
                >
                    <Label>Change Time & Timezone</Label>
                </Button>
            </div> -->
        </fieldset>

        <h2>Units</h2>
        <fieldset>
            <ConfigTemplatedInput key={`settings.units`} />
            <div class="tip">
                Note, units sets both the machine default units and the units used in motor configuration. GCode program-start,
                set below, may also change the default machine units.
            </div>
        </fieldset>

        <h2>Probing</h2>
        <fieldset>
            <ConfigTemplatedInput key={`settings.probing-prompts`} />
            <div class="tip">
                Onefinity highly recommends that you keep the safety prompts
                enabled. If you choose to live dangerously, and disable the
                safety prompts, Onefinity cannot be held responsible.
            </div>
            
            <h3>Probe Block</h3>
            
            {#each Object.keys(configTemplate.probe) as key}
            {#if key !== "probe-diameter"}
            <ConfigTemplatedInput key={`probe.${key}`} />
            {/if}
            {/each}

            <br />

            <h3>Probe Rotary</h3>

            {#each Object.keys(configTemplate["probe-rotary"]) as key}
                {#if key !== "probe-diameter"}
                    <ConfigTemplatedInput key={`probe-rotary.${key}`} />
                {/if}
            {/each}
        </fieldset>

        <fieldset>
            <h2>GCode</h2>
            {#each Object.keys(configTemplate.gcode) as key}
                <ConfigTemplatedInput key={`gcode.${key}`} />
            {/each}
        </fieldset>

        <h2>Path Accuracy</h2>
        <fieldset>
            <ConfigTemplatedInput key={`settings.max-deviation`} />

            <div class="tip">
                Lower the maximum deviation to follow the programmed path more
                precisely but at a slower speed.
            </div>

            <div class="tip">
                In order to improve traversal speed, the path planner may merge
                consecutive moves or round off sharp corners if doing so would
                deviate from the program path by less than the maximum
                deviation.
            </div>

            <div class="tip">
                GCode commands
                <a href={`${gcodeURL}#gcode:g61`} target="_blank">G61, G61.1</a>
                and <a href={`${gcodeURL}#gcode:g64`} target="_blank">G64</a> also
                affect path planning accuracy.
            </div>
        </fieldset>

        <h2>Cornering Speed (Advanced)</h2>
        <fieldset>
            <ConfigTemplatedInput key={`settings.junction-accel`} />
            <div class="tip">
                Junction acceleration limits the cornering speed the planner
                will allow. Increasing this value will allow for faster
                traversal of corners but may cause the planner to violate axis
                jerk limits and stall the motors. Use with caution.
            </div>
        </fieldset>
    </div>
</div>

<style lang="scss">
    .settings-view {
        .tip {
            margin-left: 210px;
            margin-bottom: 15px;
            font-style: italic;
            font-size: 90%;
            line-height: 1.5;
        }
    }
</style>
