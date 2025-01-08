<script type="ts">
    import Dialog, { Title, Content, Actions } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import LinearProgress from "@smui/linear-progress";
    import { waitForChange } from "$lib/StoreHelpers";
    import { ControllerMethods } from "$lib/RegisterControllerMethods";
    import { Config } from "$lib/ConfigStore";
    import { writable, type Writable } from "svelte/store";
    import {
        probingActive,
        probeContacted,
        probingComplete,
        probingFailed,
        probingStarted,
    } from "$lib/ControllerState";
    import { numberWithUnit } from "$lib/RegexHelpers";
    import TextFieldWithOptions from "$components/TextFieldWithOptions.svelte";
    import Icon from "svelte-icon";
    import BitDiameter from "../svgs/probe-bit-diameter.svg?raw";
    import CheckXYZ from "../svgs/probe-check-xyz.svg?raw";
    import CheckZ from "../svgs/probe-check-z.svg?raw";
    import PlaceXYZ from "../svgs/probe-place-xyz.svg?raw";
    import PlaceZ from "../svgs/probe-place-z.svg?raw";
    import PutAwayXYZ from "../svgs/probe-put-away-xyz.svg?raw";
    import PutAwayZ from "../svgs/probe-put-away-z.svg?raw";

    const ValidSteps = [
        "None",
        "CheckProbe",
        "BitDimensions",
        "PlaceProbeBlock",
        "Probe",
        "Done",
    ] as const;

    type Step = typeof ValidSteps[number];

    function isStep(str): str is Step {
        return ValidSteps.includes(str);
    }

    const stepLabels: Record<Step, string> = {
        None: "",
        CheckProbe: "Check probe",
        BitDimensions: "Bit dimensions",
        PlaceProbeBlock: "Place probe block",
        Probe: "Probe",
        Done: "Done",
    };

    const cancelled = writable(false);
    const userAcknowledged = writable(false);

    const imperialBits: `${number}/${number} in`[] = [
        "1/2 in",
        "3/8 in",
        "1/4 in",
        "1/8 in",
        "1/16 in",
        "1/32 in",
    ];

    const metricBits: `${number} mm`[] = [
        "12 mm",
        "10 mm",
        "8 mm",
        "6 mm",
        "4 mm",
        "3 mm",
    ];

    export let open;
    export let probeType: "xyz" | "z";
    export let isRotaryActive: Boolean;
    let currentStep: Step = "None";
    let cutterDiameterString: string = "";
    let cutterDiameterMetric: number;
    let cutterDiameterRotaryString: string = "";
    let cutterDiameterRotaryMetric: number;
    let showCancelButton = true;
    let steps: Step[] = [];
    let nextButton = {
        label: "Next",
        disabled: false,
        allowClose: false,
    };

    $: metric = $Config.settings?.units === "METRIC";
    $: cutterDiameterMetric = numberWithUnit
        .parse(cutterDiameterString)
        ?.toMetric();
    
    $: cutterDiameterRotaryMetric = numberWithUnit
        .parse(cutterDiameterRotaryString)
        ?.toMetric();

    $: if (open) {
        if(!cutterDiameterString){
            cutterDiameterString = localStorage.getItem("cutterDiameter") ?? "";
        }

        if(!cutterDiameterRotaryString){
            cutterDiameterRotaryString = localStorage.getItem("cutterDiameterRotary") ?? "";
        }

        // Svelte appears not to like it when you invoke
        // an async function from a reactive statement, so we
        // use requestAnimationFrame to call 'begin' at a later moment.
        requestAnimationFrame(begin);
    }

    $: if (cutterDiameterString) {
        updateButtons();
    }

    $: if (cutterDiameterRotaryString) {
        updateButtons();
    }

    $: if(isRotaryActive){   
        stepLabels["PlaceProbeBlock"] = "Start Probe";
    }

    async function begin() {
        try {
            $probingActive = true;
            assertValidProbeType();

            $probingFailed = false;

            const enableSafety = $Config.settings["probing-prompts"];

            steps = [
                enableSafety && !isRotaryActive ? "CheckProbe" : undefined,
                probeType === "xyz" || isRotaryActive ? "BitDimensions" : undefined,
                enableSafety ? "PlaceProbeBlock" : undefined,
                "Probe",
                "Done",
            ].filter<Step>(isStep);

            if(!isRotaryActive){
                await stepCompleted("CheckProbe", probeContacted);
            }

            if (probeType === "xyz") {
                await stepCompleted("BitDimensions", userAcknowledged);
                localStorage.setItem(
                    "cutterDiameter",
                    numberWithUnit.normalize(cutterDiameterString)
                );
            }

            if (isRotaryActive) {
                await stepCompleted("BitDimensions", userAcknowledged);
                localStorage.setItem(
                    "cutterDiameterRotary",
                    numberWithUnit.normalize(cutterDiameterRotaryString)
                );
            }

            await stepCompleted("PlaceProbeBlock", userAcknowledged);
            await stepCompleted("Probe", probingComplete, probingFailed);
            await stepCompleted("Done", userAcknowledged);

            if (probeType === "xyz" || isRotaryActive) {
                ControllerMethods.gotoZero("xy");
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

        if (!steps.includes(currentStep)) {
            return;
        }

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
                nextButton.disabled = probeType === 'xyz' ? !isFinite(cutterDiameterMetric) : !isFinite(cutterDiameterRotaryMetric);
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

        const config = isRotaryActive ? $Config["probe-rotary"] : $Config.probe;

        const probeBlockWidth = config["probe-xdim"];
        const probeBlockLength = config["probe-ydim"];
        const probeBlockHeight = config["probe-zdim"];
        const slowSeek = config["probe-slow-seek"];
        const fastSeek = config["probe-fast-seek"];

        const cutterLength = 12.7;
        const zLift = 1;
        const cutterDiameter = isRotaryActive ? cutterDiameterRotaryMetric : cutterDiameterMetric;
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
            
                G91 G0 Z 25

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
    aria-labelledby="probe-dialog-title"
    aria-describedby="probe-dialog-content"
    surface$style="width: 700px; max-width: calc(100vw - 32px);"
>
    <Title id="probe-dialog-title">Probing {probeType?.toUpperCase()}</Title>

    <Content id="probe-dialog-content" style="overflow: visible;">
        <div class="steps">
            <p>
                <b>Step {steps.indexOf(currentStep) + 1} of {steps.length}</b>
            </p>
            <ul>
                {#each steps as step}
                    <li class:active={currentStep === step}>
                        {stepLabels[step]}
                    </li>
                {/each}
            </ul>
        </div>
        <div style="width: 100%">
            {#if currentStep === "CheckProbe"}
                <p>
                    Attach the probe magnet to the collet, then touch the probe
                    block to the bit.
                </p>
                {#if !isRotaryActive} 
                    <Icon
                        data={probeType === "xyz" ? CheckXYZ : CheckZ}
                        size="300px"
                        class="probe-icon-svg"
                    />
                {/if}
            {:else if currentStep === "BitDimensions"}
                {#if probeType === "xyz"} 
                    <TextFieldWithOptions
                        label="Cutter diameter"
                        variant="filled"
                        spellcheck="false"
                        style="width: 100%;"
                        bind:value={cutterDiameterString}
                        options={[imperialBits, metricBits]}
                        valid={isFinite(cutterDiameterMetric)}
                        helperText={`Examples: 1/2", 10 mm, 0.25 in`}
                    />

                    <Icon data={BitDiameter} size="150px" class="probe-icon-svg" />
                {:else}
                    <TextFieldWithOptions
                        label="Cutter diameter"
                        variant="filled"
                        spellcheck="false"
                        style="width: 100%;"
                        bind:value={cutterDiameterRotaryString}
                        options={[imperialBits, metricBits]}
                        valid={isFinite(cutterDiameterRotaryMetric)}
                        helperText={`Examples: 1/2", 10 mm, 0.25 in`}
                    />

                    <Icon data={BitDiameter} size="150px" class="probe-icon-svg" />
                {/if}
            {:else if currentStep === "PlaceProbeBlock"}
                <p>
                    {#if probeType === "xyz" && !isRotaryActive}
                        Place the probe block face up, on the lower-left corner
                        of your workpiece.
                    {:else if probeType === "xyz" && isRotaryActive}
                        You are about to start the probing of rotary. <br/><br/> <strong>Note: </strong><br/>Position the bit above the probe and attach the probe magnet.
                    {:else}
                        Place the probe block face down, with the bit above the
                        recess.
                    {/if}
                </p>

                {#if !isRotaryActive} 
                    <Icon
                        data={probeType === "xyz" ? PlaceXYZ : PlaceZ}
                        width="304px"
                        height="129px"
                        class="probe-icon-svg"
                    />
                {/if}

                <p>
                    The probing procedure will begin as soon as you click
                    'Next'.
                </p>
            {:else if currentStep === "Probe"}
                <p>Probing in progress...</p>

                <LinearProgress indeterminate />
            {:else if currentStep === "Done"}
                {#if $probingFailed}
                    <h3>Emergency Stop!</h3>

                    <p>Could not find the probe block during probing!</p>

                    <p>
                        Make sure the tip of the bit is less than {metric
                            ? "25mm"
                            : "1 in"}
                        above the probe block, and try again.
                    </p>
                {:else}
                    <p>
                        {#if isRotaryActive}
                            Probing complete
                        {:else}
                            Don't forget to put away the probe!
                        {/if}
                    </p>

                    {#if !isRotaryActive} 
                        <Icon
                            data={probeType === "xyz" ? PutAwayXYZ : PutAwayZ}
                            width="329px"
                            height="256px"
                            class="probe-icon-svg"
                        />
                    {/if}

                    {#if probeType === "xyz" || isRotaryActive}
                        <p>The machine will now move to the XY origin.</p>

                        <p>Watch your hands!</p>
                    {/if}
                {/if}
            {/if}
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
        .probe-dialog {
            .mdc-linear-progress {
                height: 10px;
                margin: 10px 0;
            }

            .mdc-linear-progress__bar-inner {
                border-top-width: 10px;
            }

            .probe-icon-svg {
                display: block;
                margin: 20px auto;
            }

            #probe-dialog-content {
                display: flex;
                flex-direction: row;
            }

            .bit-dimensions {
                display: flex;
                flex-direction: column;
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
    }
</style>
