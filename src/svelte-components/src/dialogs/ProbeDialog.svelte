<script type="ts" context="module">
  import { get, writable, type Writable } from "svelte/store";

  type Step =
    | "None"
    | "CheckProbe"
    | "BitDimensions"
    | "PlaceProbeBlock"
    | "Probe"
    | "Done";

  const stepLabels: Record<Step, string> = {
    None: "",
    CheckProbe: "Check probe",
    BitDimensions: "Bit dimensions",
    PlaceProbeBlock: "Place probe block",
    Probe: "Probe",
    Done: "Done",
  };

  const cancelled = writable(false);
  const probingActive = writable(false);
  const probeContacted = writable(false);
  const probingStarted = writable(false);
  const probingFailed = writable(false);
  const probingComplete = writable(false);
  const userAcknowledged = writable(false);

  export function handleControllerStateUpdate(state: Record<string, any>) {
    if (!get(probingActive)) {
      return;
    }

    switch (true) {
      case state.pw === 0:
        probeContacted.set(true);
        break;

      case state.log?.msg === "Switch not found":
        probingFailed.set(true);
        break;

      case state.cycle !== "idle":
        probingStarted.set(true);
        break;

      case state.cycle === "idle":
        if (get(probingStarted)) {
          probingStarted.set(false);
          probingComplete.set(true);
        }
        break;
    }
  }
</script>

<script type="ts">
  import DimensionInput from "$components/DimensionInput.svelte";
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import { waitForChange } from "$lib/StoreHelpers";
  import { ControllerMethods } from "$lib/RegisterControllerMethods";
  import { Config } from "$lib/ConfigStore";

  const cutterDiameterOptions = [
    { value: 0.5, metric: false },
    { value: 10, metric: true },
    { value: 0.25, metric: false },
    { value: 6, metric: true },
    { value: 0.125, metric: false },
    { value: 3, metric: true },
  ];

  const cutterLengthOptions = [
    { value: 1, metric: false },
    { value: 20, metric: true },
    { value: 0.5, metric: false },
    { value: 10, metric: true },
    { value: 0.25, metric: false },
    { value: 6, metric: true },
  ];

  export let open;
  export let probeType: "xyz" | "z";
  let currentStep: Step = "None";
  let cutterDiameter: number;
  let cutterLength: number;
  let showCancelButton = true;
  let steps: Array<Step> = [];
  let nextButton = {
    label: "Next",
    disabled: false,
    allowClose: false,
  };

  $: metric = $Config.settings?.units === "METRIC";

  $: if (open) {
    cutterDiameter =
      Number.parseFloat(localStorage.getItem("cutterDiameter")) || null;
    cutterLength =
      Number.parseFloat(localStorage.getItem("cutterLength")) || null;

    // Svelte appears not to like it when you invoke
    // an async function from a reactive statement, so we
    // use requestAnimationFrame to call 'begin' at a later moment.
    requestAnimationFrame(begin);
  }

  $: if (cutterDiameter && cutterLength) {
    updateButtons();
  }

  function removeSkippedSteps(steps: Step[]): Step[] {
    return steps.filter((x) => x);
  }

  async function begin() {
    try {
      $probingActive = true;
      assertValidProbeType();

      steps = removeSkippedSteps([
        "CheckProbe",
        probeType === "xyz" ? "BitDimensions" : undefined,
        "PlaceProbeBlock",
        "Probe",
        "Done",
      ]);

      await stepCompleted("CheckProbe", probeContacted);

      if (probeType === "xyz") {
        await stepCompleted("BitDimensions", userAcknowledged);
        localStorage.setItem("cutterDiameter", cutterDiameter);
        localStorage.setItem("cutterLength", cutterLength);
      }

      await stepCompleted("PlaceProbeBlock", userAcknowledged);
      await stepCompleted("Probe", probingComplete, probingFailed);
      await stepCompleted("Done", userAcknowledged);

      if (probeType === "xyz") {
        ControllerMethods.goto_zero(1, 1, 0, 0);
      }
    } catch (err) {
      if (err.message !== "cancelled") {
        console.error("Error during probing:", err);
      }
    } finally {
      $probingActive = false;
      currentStep = "None";

      if ($probingStarted) {
        ControllerMethods.stop();
      }

      clearFlags();
    }
  }

  function assertValidProbeType() {
    switch (probeType) {
      case "xyz":
      case "z":
        break;

      default:
        throw new Error(`Invalid probe type: ${probeType}`);
    }
  }

  async function stepCompleted(
    nextStep: Step,
    ...writables: Array<Writable<any>>
  ) {
    currentStep = nextStep;

    clearFlags();
    updateButtons();

    if (currentStep === "Probe") {
      executeProbe();
    }

    await Promise.race([
      ...writables.map((writable) => waitForChange(writable)),
      waitForChange(cancelled),
    ]);

    if ($cancelled) {
      throw new Error("cancelled");
    }
  }

  function clearFlags(foo: string = "") {
    $cancelled = false;
    $probeContacted = false;
    $probingStarted = false;
    $probingFailed = false;
    $probingComplete = false;
    $userAcknowledged = false;
  }

  function updateButtons() {
    showCancelButton = true;

    nextButton = {
      label: "Next",
      disabled: false,
      allowClose: false,
    };

    switch (currentStep) {
      case "CheckProbe":
      case "Probe":
        nextButton.disabled = true;
        break;

      case "BitDimensions":
        nextButton.disabled = !(
          cutterDiameter !== null &&
          cutterDiameter !== 0 &&
          isFinite(cutterDiameter) &&
          cutterLength !== null &&
          cutterLength !== 0 &&
          isFinite(cutterLength)
        );
        break;

      case "Done":
        showCancelButton = false;
        nextButton = {
          disabled: false,
          label: "Done",
          allowClose: true,
        };
        break;
    }
  }

  function executeProbe() {
    const probeBlockWidth = $Config.probe["probe-xdim"];
    const probeBlockLength = $Config.probe["probe-ydim"];
    const probeBlockHeight = $Config.probe["probe-zdim"];
    const slowSeek = $Config.probe["probe-slow-seek"];
    const fastSeek = $Config.probe["probe-fast-seek"];

    const zLift = 1;
    const xOffset = probeBlockWidth + cutterDiameter / 2.0;
    const yOffset = probeBlockLength + cutterDiameter / 2.0;
    const zOffset = probeBlockHeight;

    if (probeType === "z") {
      ControllerMethods.send(`
        G21
        G92 Z0
    
        G38.2 Z -25.4 F${fastSeek}
        G91 G1 Z 1
        G38.2 Z -2 F${slowSeek}
        G92 Z ${zOffset}
    
        G91 G0 Z 3

        M2
      `);
    } else {
      // After probing Z, we want to drop the bit down:
      // Ideally, 12.7mm/0.5in
      // And we don't want to be more than 90% down on the probe block
      // Also, add zlift to compensate for the fact that we lift after probing Z
      const plunge = Math.min(cutterLength, zOffset * 0.9) + zLift;

      ControllerMethods.send(`
        G21
        G92 X0 Y0 Z0
        
        G38.2 Z -25 F${fastSeek}
        G91 G1 Z 1
        G38.2 Z -2 F${slowSeek}
        G92 Z ${zOffset}
    
        G91 G0 Z ${zLift}
        G91 G0 X 20
        G91 G0 Z ${-plunge}
        G38.2 X -20 F${fastSeek}
        G91 G1 X 1
        G38.2 X -2 F${slowSeek}
        G92 X ${xOffset}

        G91 G0 X 1
        G91 G0 Y 20
        G91 G0 X -20
        G38.2 Y -20 F${fastSeek}
        G91 G1 Y 1
        G38.2 Y -2 F${slowSeek}
        G92 Y ${yOffset}

        G91 G0 Y 3
        G91 G0 Z 25

        M2
      `);
    }
  }
</script>

<Dialog
  bind:open
  class="probe-dialog"
  scrimClickAction=""
  aria-labelledby="simple-title"
  aria-describedby="simple-content"
  surface$style="width: 700px; height: 400px; max-width: calc(100vw - 32px); overflow: visible;"
>
  <Title id="simple-title">Probing {probeType?.toUpperCase()}</Title>

  <Content id="simple-content" style="overflow: visible;">
    <div class="steps">
      <p><b>Step {steps.indexOf(currentStep) + 1} of {steps.length}</b></p>
      <ul>
        {#each steps as step}
          <li class:active={currentStep === step}>{stepLabels[step]}</li>
        {/each}
      </ul>
    </div>
    <div class="current-step">
      <p>
        {#if currentStep === "CheckProbe"}
          Attach the probe magnet to the collet, then touch the probe block to
          the bit.
        {:else if currentStep === "BitDimensions"}
          <DimensionInput
            label="Cutter diameter"
            options={cutterDiameterOptions}
            bind:value={cutterDiameter}
            {metric}
          />
          <DimensionInput
            label="Cutter length"
            options={cutterLengthOptions}
            bind:value={cutterLength}
            {metric}
          />
        {:else if currentStep === "PlaceProbeBlock"}
          {#if probeType === "xyz"}
            Place the probe block face up, on the lower-left corner of your
            workpiece.
          {:else}
            Place the probe block face down, with the bit above the recess.
          {/if}
        {:else if currentStep === "Probe"}
          Probing in progress...
        {:else if currentStep === "Done"}
          {#if $probingFailed}
            Could not find the probe block during probing!

            <p>
              Make sure the tip of the bit is less than {metric
                ? "25mm"
                : "1 in"} above the probe block, and try again.
            </p>
          {:else}
            Don't forget to put away the probe!

            {#if probeType === "xyz"}
              <p>The machine will now move to the XY origin.</p>

              <p>Watch your hands!</p>
            {/if}
          {/if}
        {/if}
      </p>
    </div>
  </Content>

  <Actions>
    {#if showCancelButton}
      <Button on:click={() => ($cancelled = true)}>
        <Label>Cancel</Label>
      </Button>
    {/if}
    <Button
      defaultAction
      data-mdc-dialog-action={nextButton.allowClose ? "close" : ""}
      disabled={nextButton.disabled}
      on:click={() => ($userAcknowledged = true)}
    >
      <Label>
        {nextButton.label}
      </Label>
    </Button>
  </Actions>
</Dialog>

<style lang="scss">
  $primary: #0078e7;
  $very-dark: #555;
  $text: #777;
  $grey: #bbb;
  $light: #ddd;

  :global {
    .mdc-dialog__content {
      display: flex;
      flex-direction: row;
    }

    .current-step {
      flex-grow: 1;

      .mdc-text-field {
        margin-bottom: 20px;
      }
    }

    .steps {
      margin-right: 50px;

      ul {
        margin: 0 auto;
        list-style-type: none;
        counter-reset: steps;
        margin: 0;
        font-family: sans-serif;
        padding-inline-start: 20px;
      }

      ul li {
        padding: 0 0 12px 30px;
        position: relative;
        margin: 0;
        white-space: nowrap;
        color: $text;

        &:after {
          position: absolute;
          top: 3px;
          left: 0.5px;
          content: "";
          border: 2px solid $text;
          border-radius: 50%;
          display: inline-block;
          height: 11px;
          width: 11px;
          text-align: center;
          line-height: 12px;
          background: transparent;
        }

        &:before {
          position: absolute;
          left: 7px;
          top: 22px;
          bottom: 0;
          content: "";
          width: 0;
          border-left: 2px solid $text;
        }

        &:last-of-type:before {
          border: none;
        }

        &.active {
          color: $primary;
          font-weight: bold;

          &:after {
            border: 3px solid $primary;
            top: 2.5px;
            left: 0;
          }
        }
      }
    }
  }
</style>
