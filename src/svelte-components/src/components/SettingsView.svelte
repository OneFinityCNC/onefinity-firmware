<script lang="ts">
  import configTemplate from "../../../resources/config-template.json";
  import ScreenRotationDialog from "$dialogs/ScreenRotationDialog.svelte";
  import ConfigTemplatedInput from "./ConfigTemplatedInput.svelte";

  const gcodeURL = "https://linuxcnc.org/docs/html/gcode/g-code.html";

  let showScreenRotationDialog = false;
</script>

<ScreenRotationDialog bind:open={showScreenRotationDialog} />

<h1>Settings</h1>

<div class="pure-form pure-form-aligned">
  <h2>User Interface</h2>
  <fieldset>
    <div class="pure-control-group">
      <label for="screen-rotation" />
      <button
        class="pure-button"
        name="screen-rotation"
        on:click={() => (showScreenRotationDialog = true)}
      >
        Change Screen Rotation
      </button>
    </div>
  </fieldset>

  <fieldset>
    <h2>Probe Dimensions</h2>
    {#each Object.keys(configTemplate.probe) as key}
      {#if key !== "probe-diameter"}
        <ConfigTemplatedInput key={`probe.${key}`} />
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
  </fieldset>

  <p>
    Lower <tt>max-deviation</tt> to follow the programmed path more precisely but
    at a slower speed.
  </p>

  <p>
    In order to improve traversal speed, the path planner may merge consecutive
    moves or round off sharp corners if doing so would deviate from the program
    path by less than <tt>max-deviation</tt>.
  </p>

  <p>
    GCode commands
    <a href={`${gcodeURL}#gcode:g61`} target="_blank">G61, G61.1</a>
    and <a href={`${gcodeURL}#gcode:g64`} target="_blank"> G64</a> also affect path
    planning accuracy.
  </p>

  <h2>Cornering Speed (Advanced)</h2>
  <fieldset>
    <ConfigTemplatedInput key={`settings.junction-accel`} />
  </fieldset>

  <p>
    Junction acceleration limits the cornering speed the planner will allow.
    Increasing this value will allow for faster traversal of corners but may
    cause the planner to violate axis jerk limits and stall the motors. Use with
    caution.
  </p>
</div>
