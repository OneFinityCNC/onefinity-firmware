<script type="ts" context="module">
  import Dialog, { Title, Content, Actions } from "@smui/dialog";
  import Button, { Label } from "@smui/button";
  import { get, writable, type Writable } from "svelte/store";
  import { Config } from "$lib/ConfigStore";
  import { waitForChange } from "$lib/StoreHelpers";
  import { ControllerMethods } from "$lib/RegisterControllerMethods";

  type Step =
    | "None"
    | "TestingProbe"
    | "GetToolDiameter"
    | "Probing"
    | "ProbingFailed"
    | "ProbingComplete";

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
  export let open;
  export let probeType: "xyz" | "z";
  let step: Step = "None";
  let toolDiameter;
  let showCancelButton = true;
  let nextButton = {
    label: "Next",
    disabled: false,
    allowClose: false,
  };

  $: showPrompts = $Config.settings?.["probing-prompts"];

  $: if (open) {
    toolDiameter = "";

    // Svelte appears not to like it when you invoke
    // an async function from a reactive statement, so we
    // use requestAnimationFrame to call begin at a later moment.
    requestAnimationFrame(begin);
  }

  async function begin() {
    try {
      $probingActive = true;
      assertValidProbeType();

      if (showPrompts) {
        await stepCompleted("TestingProbe", probeContacted);
      }

      if (probeType === "xyz") {
        await stepCompleted("GetToolDiameter", userAcknowledged);
      }

      do {
        await stepCompleted("Probing", probingComplete, probingFailed);

        if ($probingFailed) {
          await stepCompleted("ProbingFailed", userAcknowledged);
        }
      } while (!$probingComplete);

      await stepCompleted("ProbingComplete", userAcknowledged);

      if (probeType === "xyz") {
        ControllerMethods.goto_zero(1, 1, 0, 0);
      }
    } catch (err) {
      if (err.message !== "cancelled") {
        console.error("Error during probing:", err);
      }
    } finally {
      $probingActive = false;
      step = "None";

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
    step = nextStep;

    clearFlags();
    updateButtons();

    if (step === "Probing") {
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

    switch (step) {
      case "TestingProbe":
      case "Probing":
        nextButton.disabled = true;
        break;

      case "ProbingComplete":
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
    const xOffset = probeBlockWidth + toolDiameter / 2.0;
    const yOffset = probeBlockLength + toolDiameter / 2.0;
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
      // And we don't want to be more than 75% down on the probe block
      // Also, add zlift to compensate for the fact that we lift after probing Z
      const plunge = Math.min(12.7, zOffset * 0.75) + zLift;

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
  scrimClickAction=""
  aria-labelledby="simple-title"
  aria-describedby="simple-content"
>
  <Title id="simple-title">Probe {probeType}</Title>

  <Content id="simple-content">
    {#if step === "TestingProbe"}
      <p>Attach the probe magnet to the collet.</p>
      <p>Touch the probe block to the bit.</p>

      {#if $probeContacted}
        <p>Probe contact detected!</p>
      {:else}
        <p>Waiting for probe contact...</p>
      {/if}
    {:else if step === "GetToolDiameter"}
      <label for="tool-diameter">Tool Diameter (mm)</label>
      <input id="tool-diameter" bind:value={toolDiameter} />
    {:else if step === "Probing"}
      <p>Probing in progress...</p>
    {:else if step === "ProbingFailed"}
      <p>Could not find the probe block during probing!</p>
      <p>
        Make sure the tip of the bit is about 1/4" (6mm) above the probe block,
        and try again.
      </p>
    {:else if step === "ProbingComplete"}
      <p>Don't forget to put away the probe!</p>
      <p>The machine will now move to the XY origin.</p>
      <p>Watch your hands!</p>
    {/if}
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
