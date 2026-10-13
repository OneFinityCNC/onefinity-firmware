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
        centerProbeOk,
        centerProbeDz,
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
        "ProbeLocation",
        "PlaceProbeBlock",
        "Probe",
        "MoveProbeBlock",
        "Probe2",
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
        ProbeLocation: "Probe location",
        // (shown as "Which side?" for the Probe Center button, see markup)
        PlaceProbeBlock: "Place probe block",
        Probe: "Probe",
        MoveProbeBlock: "Move probe block",
        Probe2: "Probe second corner",
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
    let initialized = false;
    // "center" comes from the Probe Center button. It uses the XYZ probe
    // block geometry, so internally it behaves like "xyz" (isXYZ).
    export let probeType: "xyz" | "z" | "center";
    $: isXYZ = probeType === "xyz" || probeType === "center";
    $: isCenterButton = probeType === "center";
    export let isRotaryActive: Boolean;
    let currentStep: Step = "None";
    let cutterDiameterString: string = "";
    let cutterDiameterMetric: number;
    let cutterDiameterRotaryString: string = "";
    let cutterDiameterRotaryMetric: number;
    let showCancelButton = true;

    // Probe location: one of the four stock corners, or the stock center.
    // "front-left" is the original Onefinity behaviour and generates the
    // exact same G-code as before.
    type ProbeLocation = "front-left" | "front-right" | "back-left" | "back-right" | "center" | "center-x";
    const allProbeLocations: { value: ProbeLocation; label: string }[] = [
        { value: "front-left", label: "Front-left corner (standard)" },
        { value: "front-right", label: "Front-right corner" },
        { value: "back-left", label: "Back-left corner" },
        { value: "back-right", label: "Back-right corner" },
        { value: "center", label: "Side A: center of stock (sets X, Y and Z)" },
        { value: "center-x", label: "Side B, after an end-for-end flip (sets X and Z, keeps Y)" },
    ];
    let probeLocation: ProbeLocation = "front-left";
    const isCenterLocation = (l: string) => l === "center" || l === "center-x";
    // Probe XYZ offers only the four corners; Probe Center only Side A / B.
    $: probeLocations = allProbeLocations.filter((l) =>
        isCenterButton ? isCenterLocation(l.value) : !isCenterLocation(l.value));
    $: locationStorageKey = isCenterButton ? "probeCenterSide" : "probeLocation";
    // Center probing: for the second placement the user jogs the bit over
    // the back-right block, so no stock size is needed or guessed.
    $: usesLocation = isXYZ && !isRotaryActive;
    $: isCenter = usesLocation && (probeLocation === "center" || probeLocation === "center-x");
    $: isCenterX = usesLocation && probeLocation === "center-x";

    let jogStep = 10;
    function jog(axis: "X" | "Y" | "Z", direction: 1 | -1) {
        ControllerMethods.send(`
            G91 G0 ${axis}${direction * jogStep}
            G90
        `);
    }
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

    $: if (open && !initialized) {
        initialized = true;
        if(!cutterDiameterString){
            cutterDiameterString = localStorage.getItem("cutterDiameter") ?? "";
        }

        if(!cutterDiameterRotaryString){
            cutterDiameterRotaryString = localStorage.getItem("cutterDiameterRotary") ?? "";
        }

        const savedLocation = localStorage.getItem(locationStorageKey);
        if (probeLocations.some((l) => l.value === savedLocation)) {
            probeLocation = savedLocation as ProbeLocation;
        } else {
            probeLocation = probeLocations[0].value;
        }

        // Svelte appears not to like it when you invoke
        // an async function from a reactive statement, so we
        // use requestAnimationFrame to call 'begin' at a later moment.
        requestAnimationFrame(begin);
    }


    $: if (!open) {
        initialized = false;
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

            const locationStep = isXYZ && !isRotaryActive;

            steps = [
                enableSafety && !isRotaryActive ? "CheckProbe" : undefined,
                isXYZ ? "BitDimensions" : undefined,
                locationStep ? "ProbeLocation" : undefined,
                enableSafety ? "PlaceProbeBlock" : undefined,
                "Probe",
                // The second placement is always shown for center probing,
                // because the user must physically move the block.
                locationStep ? "MoveProbeBlock" : undefined,
                locationStep ? "Probe2" : undefined,
                "Done",
            ].filter<Step>(isStep);

            if(!isRotaryActive){
                await stepCompleted("CheckProbe", probeContacted);
            }

            if (isXYZ) {
                if(isRotaryActive){
                    await stepCompleted("BitDimensions", userAcknowledged);
                    localStorage.setItem(
                        "cutterDiameterRotary",
                        numberWithUnit.normalize(cutterDiameterRotaryString)
                    );
                } else {
                    await stepCompleted("BitDimensions", userAcknowledged);
                    localStorage.setItem(
                        "cutterDiameter",
                        numberWithUnit.normalize(cutterDiameterString)
                    );
                }
            }

            if (locationStep) {
                await stepCompleted("ProbeLocation", userAcknowledged);
                localStorage.setItem(locationStorageKey, probeLocation);

                if (probeLocation === "center" || probeLocation === "center-x") {
                    $centerProbeOk = null;
                    $centerProbeDz = null;
                } else {
                    // Corner probing has no second placement
                    steps = steps.filter((s) => s !== "MoveProbeBlock" && s !== "Probe2");
                }
            }

            await stepCompleted("PlaceProbeBlock", userAcknowledged);
            await stepCompleted("Probe", probingComplete, probingFailed);

            if ($probingFailed) {
                await stepCompleted("Done", userAcknowledged);
                return;
            }

            await stepCompleted("MoveProbeBlock", userAcknowledged);
            await stepCompleted("Probe2", probingComplete, probingFailed);
            await stepCompleted("Done", userAcknowledged);

            if (isCenter && $centerProbeOk === 0) {
                return; // origin unchanged; nothing to move to
            }

            if (isXYZ ) {
                if(isRotaryActive){
                    ControllerMethods.gotoZero("y");
                } else {
                    ControllerMethods.gotoZero("xy");
                }
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
            case "center":
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

        if (currentStep === "Probe2") {
            executeCenterSecondProbe();
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
            case "Probe2":
                nextButton.disabled = true;
                break;

            case "ProbeLocation":
                nextButton.disabled = false;
                break;

            case "BitDimensions":
                nextButton.disabled = isRotaryActive ? !isFinite(cutterDiameterRotaryMetric) : !isFinite(cutterDiameterMetric);
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
            if (isRotaryActive) {
              // Probing for rotary axis
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

          } else {
            // After probing Z, we want to drop the bit down:
            // Ideally, 12.7mm/0.5in
            // And we don't want to be more than 90% down on the probe block
            // Also, add zlift to compensate for the fact that we lift after probing Z
            const plunge = Math.min(cutterLength, zOffset * 0.9) + zLift;

            // Direction signs for the chosen corner. Front-left (sx = sy = 1)
            // produces exactly the original Onefinity G-code.
            // The center mode probes front-left first, so it also uses +1/+1.
            const loc = probeLocation;
            const sx = loc === "front-right" || loc === "back-right" ? -1 : 1;
            const sy = loc === "back-left" || loc === "back-right" ? -1 : 1;

            // The block is rotated 90 degrees at front-right and back-left,
            // so its X and Y faces swap. At back-right it is rotated 180
            // degrees, so they do not.
            const rotated90 = loc === "front-right" || loc === "back-left";
            const xOff = rotated90 ? yOffset : xOffset;
            const yOff = rotated90 ? xOffset : yOffset;

            const keepY = loc === "center-x";

            ControllerMethods.send(`
                G21
                ${keepY ? "G92 X0 Z0" : "G92 X0 Y0 Z0"}
${cornerProbeSequence({
    sx, sy, plunge, zLift, fastSeek, slowSeek,
    afterZ: `G92 Z ${zOffset}`,
    afterX: `G92 X ${sx * xOff}`,
    afterY: `G92 Y ${sy * yOff}`,
    remember: loc === "center" || keepY,
    probeY: !keepY,
})}
                M2
            `);
        }
      }
    }
    // One probe sequence for every corner, shared by both center placements,
    // so the second placement is an exact mirror of the first: the same Z
    // touch on the block top, the same lift, the same plunge (computed from
    // probe-zdim, never hard-coded), with only the X/Y directions reversed.
    // Front-left (sx = sy = 1) with G92 hooks is the original Onefinity probe.
    function cornerProbeSequence(o: {
        sx: number; sy: number; plunge: number; zLift: number;
        fastSeek: number; slowSeek: number;
        afterZ: string; afterX: string; afterY: string;
        remember?: boolean;
        probeY?: boolean;
    }) {
        const keep = (name: string, param: string) =>
            o.remember ? `#<_ofprobe_${name}> = ${param}` : "";
        return `
                G38.2 Z -25 F${o.fastSeek}
                G91 G1 Z 1
                G38.2 Z -2 F${o.slowSeek}
                ${keep("zt", "#5063")}
                ${keep("ok", "-1")}
                ${o.afterZ}

                G91 G0 Z ${o.zLift}
                G91 G0 X ${20 * o.sx}
                G91 G0 Z ${-o.plunge}
                G38.2 X ${-20 * o.sx} F${o.fastSeek}
                G91 G1 X ${1 * o.sx}
                G38.2 X ${-2 * o.sx} F${o.slowSeek}
                ${keep("xa", "#5061")}
                ${o.afterX}

${o.probeY === false ? `
                G91 G0 X ${1 * o.sx}
` : `                G91 G0 X ${1 * o.sx}
                G91 G0 Y ${20 * o.sy}
                G91 G0 X ${-20 * o.sx}
                G38.2 Y ${-20 * o.sy} F${o.fastSeek}
                G91 G1 Y ${1 * o.sy}
                G38.2 Y ${-2 * o.sy} F${o.slowSeek}
                ${keep("ya", "#5062")}
                ${o.afterY}

                G91 G0 Y ${3 * o.sy}
`}                G91 G0 Z 25
`;
    }

    // CENTER-SECOND-PLACEMENT: the block is on the back-right corner,
    // rotated 180 degrees, and the user has jogged the bit over its
    // front-left corner (the mirror of where the first probe starts). From
    // there it runs the shared sequence with X and Y reversed: Z touch, lift,
    // plunge from probe-zdim, X, then Y.
    //
    // Safety: if this Z touch differs from the first by more than 0.5 mm
    // (e.g. the bit came down on the stock instead of the block), it lifts
    // and stops without moving sideways and without changing the origin.
    //
    // The center is the midpoint of the two X contacts and the two Y
    // contacts, so block dimensions and bit diameter cancel out of it.
    function executeCenterSecondProbe() {
        const config = $Config.probe;
        const probeBlockHeight = config["probe-zdim"];
        const slowSeek = config["probe-slow-seek"];
        const fastSeek = config["probe-fast-seek"];
        const cutterLength = 12.7;
        const zLift = 1;
        const plunge = Math.min(cutterLength, probeBlockHeight * 0.9) + zLift;
        const r = cutterDiameterMetric / 2.0;
        const keepY = probeLocation === "center-x";

        // Distance from each contacted block face to the stock edge it sits
        // on. First placement: front-left block, normal orientation. Second
        // placement: back-right rotated 180 (same axes) for full center, or
        // front-right rotated 90 (X and Y faces swap) for center-X.
        const leftDim = config["probe-xdim"];
        const rightDim = keepY ? config["probe-ydim"] : config["probe-xdim"];
        const frontDim = config["probe-ydim"];
        const backDim = config["probe-ydim"];

        // Measured stock half-length / half-depth, kept in the controller as
        // #<_ofprobe_hx> / #<_ofprobe_hy> for programs such as EndSkim_Auto.
        const halfX = `[[#5061 - #<_ofprobe_xa> + ${leftDim} + ${rightDim}] / 2 + ${r}]`;
        const halfY = `[[#5062 - #<_ofprobe_ya> + ${frontDim} + ${backDim}] / 2 + ${r}]`;

        const rest = cornerProbeSequence({
            sx: -1, sy: -1, plunge, zLift, fastSeek, slowSeek,
            afterZ: "",
            // The center is midway between the two stock edges. When the
            // two blocks sit with different faces toward the ends (front-right
            // rotated 90 degrees), the face-to-edge distances differ, so
            // correct for half that difference. For full center they are
            // equal and this is the plain midpoint of the contacts.
            afterX: `#<_ofprobe_hx> = ${halfX}
                G92 X [[#5061 - #<_ofprobe_xa> + ${leftDim} - ${rightDim}] / 2]`,
            afterY: `#<_ofprobe_hy> = ${halfY}
                G92 Y [[#5062 - #<_ofprobe_ya>] / 2]`,
            probeY: !keepY,
        }).replace(/^\s*G38\.2 Z -25 F\S+\n\s*G91 G1 Z 1\n\s*G38\.2 Z -2 F\S+\n/, "");

        ControllerMethods.send(`
            G21
            G38.2 Z -25 F${fastSeek}
            G91 G1 Z 1
            G38.2 Z -2 F${slowSeek}
            #<_ofprobe_dz> = [#5063 - #<_ofprobe_zt>]
            o100 if [ABS[#<_ofprobe_dz>] GT 0.5]
                G91 G0 Z 25
                #<_ofprobe_ok> = 0
            o100 else
${rest}
                #<_ofprobe_ok> = 1
            o100 endif
            G90

            M2
        `);
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
    <Title id="probe-dialog-title">{isCenterButton ? "Probing Center" : `Probing ${probeType?.toUpperCase()}`}</Title>

    <Content id="probe-dialog-content" style="overflow: visible;">
        <div class="steps">
            <p>
                <b>Step {steps.indexOf(currentStep) + 1} of {steps.length}</b>
            </p>
            <ul>
                {#each steps as step}
                    <li class:active={currentStep === step}>
                        {step === "ProbeLocation" && isCenterButton ? "Which side?" : stepLabels[step]}
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
                        data={isXYZ ? CheckXYZ : CheckZ}
                        size="300px"
                        class="probe-icon-svg"
                    />
                {/if}
            {:else if currentStep === "BitDimensions"}
                {#if !isRotaryActive} 
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
            {:else if currentStep === "ProbeLocation"}
                <p>{isCenterButton ? "Which side are you probing?" : "Which corner should be the XY origin?"}</p>
                <div class="probe-locations">
                    {#each probeLocations as location}
                        <label>
                            <input
                                type="radio"
                                name="probe-location"
                                value={location.value}
                                bind:group={probeLocation}
                            />
                            {location.label}
                        </label>
                    {/each}
                </div>

                {#if probeLocation === "center"}
                    <p>
                        Two placements: front-left, then back-right. No stock
                        size is needed; the center is measured.
                    </p>
                {:else if probeLocation === "center-x"}
                    <p>
                        Front-left, then front-right. With the same long edge
                        against the fixed jaw (e.g. the second side after an
                        end-for-end flip): finds the X center from the two
                        ends along the front edge and sets Z. The Y origin is
                        left exactly as it was.
                    </p>
                {/if}
            {:else if currentStep === "PlaceProbeBlock"}
                <p>
                    {#if usesLocation && probeLocation === "front-right"}
                        Place the probe block face up on the front-right corner
                        of your workpiece, rotated so its lips hang over the
                        front and right edges.
                    {:else if usesLocation && probeLocation === "back-left"}
                        Place the probe block face up on the back-left corner
                        of your workpiece, rotated so its lips hang over the
                        back and left edges.
                    {:else if usesLocation && probeLocation === "back-right"}
                        Place the probe block face up on the back-right corner
                        of your workpiece, rotated so its lips hang over the
                        back and right edges.
                    {:else if usesLocation && probeLocation === "center-x"}
                        First placement: put the probe block face up on the
                        lower-left (front-left) corner, just like a normal XYZ
                        probe. Only Z and the left end are probed; Y is kept
                        from your earlier setup.
                    {:else if usesLocation && probeLocation === "center"}
                        First placement: put the probe block face up on the
                        lower-left (front-left) corner of your workpiece, just
                        like a normal XYZ probe.
                    {:else if isXYZ && !isRotaryActive}
                        Place the probe block face up, on the lower-left corner
                        of your workpiece.
                    {:else if isXYZ && isRotaryActive}
                        You are about to start the probing of rotary. <br/><br/> <strong>Note: </strong><br/>Position the bit above the probe and attach the probe magnet.
                    {:else}
                        Place the probe block face down, with the bit above the
                        recess.
                    {/if}
                </p>

                {#if !isRotaryActive && (!usesLocation || probeLocation === "front-left" || probeLocation === "center" || probeLocation === "center-x")} 
                    <Icon
                        data={isXYZ ? PlaceXYZ : PlaceZ}
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
            {:else if currentStep === "MoveProbeBlock"}
                <p>
                    {#if isCenterX}
                        Second placement: put the probe block on the
                        <b>front-right</b> corner, rotated so its lips hang
                        over the front and right edges. Both ends are then
                        touched along the front edge, the edge that sits
                        against the fixed jaw.
                    {:else}
                        Second placement: put the probe block on the
                        <b>back-right</b> corner, rotated 180 degrees so its
                        lips hang over the back and right edges.
                    {/if}
                </p>
                <p>
                    Then jog the bit over the block's <b>{isCenterX ? "left" : "front-left"}</b>
                    corner, a few mm above it: the mirror of where you start
                    the first probe (about 5 to 15 mm in from {isCenterX ? "its left edge" : "both of those edges"}). Keep the probe magnet on the collet.
                </p>
                <div class="jog-panel">
                    <div class="jog-steps">
                        Step:
                        <label><input type="radio" bind:group={jogStep} value={10} /> 10 mm</label>
                        <label><input type="radio" bind:group={jogStep} value={1} /> 1 mm</label>
                    </div>
                    <div class="jog-grid">
                        <span></span>
                        <button class="jog" on:click={() => jog("Y", 1)}>Y+ (back)</button>
                        <span></span>
                        <button class="jog" on:click={() => jog("Z", 1)}>Z+ (up)</button>
                        <button class="jog" on:click={() => jog("X", -1)}>X- (left)</button>
                        <span></span>
                        <button class="jog" on:click={() => jog("X", 1)}>X+ (right)</button>
                        <span></span>
                        <span></span>
                        <button class="jog" on:click={() => jog("Y", -1)}>Y- (front)</button>
                        <span></span>
                        <button class="jog" on:click={() => jog("Z", -1)}>Z- (down)</button>
                    </div>
                </div>
                <p>
                    {#if isCenterX}
                        Click 'Next' to probe: Z on the block top, then the
                        left face only. Y is not changed.
                    {:else}
                        Click 'Next' to probe: Z on the block top, then the
                        left and front faces.
                    {/if}
                </p>
            {:else if currentStep === "Probe2"}
                <p>Probing the second corner...</p>

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
                            data={isXYZ ? PutAwayXYZ : PutAwayZ}
                            width="329px"
                            height="256px"
                            class="probe-icon-svg"
                        />
                    {/if}

                    {#if isXYZ}
                        {#if isRotaryActive}
                            <p>
                                The machine will now move to the Y origin.
                            </p>
                        {:else}
                            <p>
                                {#if isCenter && $centerProbeOk === 0}
                                    <b>Second placement rejected.</b> The two
                                    Z touches differed by
                                    {Math.abs($centerProbeDz ?? 0).toFixed(2)} mm
                                    (limit 0.5 mm), so the bit stopped before
                                    moving sideways. The X/Y origin was NOT
                                    moved to the center. Check the block is
                                    on the back-right corner and the stock
                                    size is right, then probe again.
                                {:else if isCenterX}
                                    X0 is now the center between the two
                                    ends; Y0 is unchanged from your earlier
                                    setup. The machine will now move there.
                                {:else if isCenter}
                                    The XY origin is now the center of the
                                    stock. The machine will now move there.
                                {:else}
                                    The machine will now move to the XY origin.
                                {/if}
                            </p>
                        {/if}

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

            .probe-locations {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin: 10px 0 16px;

                label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                input[type="text"] {
                    width: 120px;
                    margin-left: auto;
                }
            }

            .jog-panel {
                margin: 10px 0;

                .jog-steps {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 8px;
                }

                .jog-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 110px);
                    gap: 6px;
                }

                .jog {
                    height: 48px;
                    font-size: 15px;
                }
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
