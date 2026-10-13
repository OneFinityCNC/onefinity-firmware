import { remotePut } from "./store.js";
import { probeActive } from "./setter.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./controller.js";
import { Modal } from "./ui.jsx";
import BitDiameter from "./svgs/probe-bit-diameter.svg?raw";
import CheckXYZ from "./svgs/probe-check-xyz.svg?raw";
import CheckZ from "./svgs/probe-check-z.svg?raw";
import PlaceXYZ from "./svgs/probe-place-xyz.svg?raw";
import PlaceZ from "./svgs/probe-place-z.svg?raw";
import PutAwayXYZ from "./svgs/probe-put-away-xyz.svg?raw";
import PutAwayZ from "./svgs/probe-put-away-z.svg?raw";

const Svg = ({ data, w }) => <div className="probe-svg" style={{ width: w }} dangerouslySetInnerHTML={{ __html: data }} />;

const LABELS = {
  CheckProbe: "Check probe", BitDimensions: "Bit dimensions", ProbeLocation: "Probe location", PlaceProbeBlock: "Place probe block",
  Probe: "Probe", MoveProbeBlock: "Move probe block", Probe2: "Probe second corner", Done: "Done",
};
const PRESET_BITS = ["1/8 in", "1/4 in"];

// ---- cutter diameter parsing (same rules as the original dialog) ----
const RX = /^\s*(?:(\d+)\s*\/\s*(\d+)|(\d*\.\d+)|(\d+(?:\.\d+)?))\s*("|in|inch|inches|mm|millimeters)\s*$/;
const FRACS = [[0.75, "3/4"], [0.625, "5/8"], [0.5, "1/2"], [0.375, "3/8"], [0.25, "1/4"], [0.1875, "3/16"], [0.125, "1/8"], [0.09375, "3/32"], [0.0625, "1/16"], [0.03125, "1/32"]];
function parseDia(str) {
  const m = (str || "").match(RX); if (!m) return undefined;
  const [, n, d, d1, d2, unit] = m;
  const metric = (unit || "").includes("m");
  let value;
  if (n && d) value = Number(n) / Number(d);
  else if (d1 && Number(d1) !== 0) value = Number(d1);
  else if (d2 && Number(d2) !== 0) value = Number(d2);
  else return undefined;
  return { value, metric, mm: metric ? value : value * 25.4 };
}
function normDia(str) {
  const p = parseDia(str); if (!p) return "";
  if (p.metric) return `${p.value} mm`;
  const f = FRACS.find(([v]) => v === p.value);
  return `${f ? f[1] : p.value} in`;
}

const LOCATIONS = [
  ["front-left", "Front-left corner (standard)"], ["front-right", "Front-right corner"], ["back-left", "Back-left corner"], ["back-right", "Back-right corner"],
  ["center", "Side A: center of stock (sets X, Y and Z)"], ["center-x", "Side B, after an end-for-end flip (sets X and Z, keeps Y)"],
];
const isCenterLoc = (l) => l === "center" || l === "center-x";

const ls = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// One probe sequence for every corner (shared by both center placements).
function cornerProbeSequence(o) {
  const keep = (name, param) => (o.remember ? `#<_ofprobe_${name}> = ${param}` : "");
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

export default function ProbeDialog({ type, config, state, send, subscribe, rotary, metric, onClose }) {
  const isXYZ = type === "xyz" || type === "center";
  const isCenterButton = type === "center";
  const usesLocation = isXYZ && !rotary;
  const locations = LOCATIONS.filter(([v]) => (isCenterButton ? isCenterLoc(v) : !isCenterLoc(v)));
  const locKey = isCenterButton ? "probeCenterSide" : "probeLocation";

  const [step, setStep] = useState("None");
  const [steps, setSteps] = useState([]);
  const [dia, setDia] = useState(() => ls("cutterDiameter") || PRESET_BITS[0]);
  const [diaRot, setDiaRot] = useState(() => ls("cutterDiameterRotary") || PRESET_BITS[0]);
  // "preset": pick 1/8 or 1/4 in. "custom": type a size.
  const [diaMode, setDiaMode] = useState(() => { const v = normDia(ls("cutterDiameter")); return !v || PRESET_BITS.includes(v) ? "preset" : "custom"; });
  const customRef = useRef(null);
  useEffect(() => { if (diaMode === "custom") customRef.current?.focus(); }, [diaMode]);
  const [loc, setLoc] = useState(() => { const s = ls(locKey); return locations.some(([v]) => v === s) ? s : locations[0][0]; });
  const [jogStep, setJogStep] = useState(10);
  const [failed, setFailed] = useState(false);
  const [centerOk, setCenterOk] = useState(null);
  const [centerDz, setCenterDz] = useState(null);

  // Everything the async flow needs lives in one ref so it can read the latest values.
  const R = useRef({});
  R.current.dia = parseDia(rotary ? diaRot : dia);
  R.current.loc = loc; R.current.config = config; R.current.rotary = rotary; R.current.type = type; R.current.send = send; R.current.state = state;
  R.current.state = state; R.current.centerOk = centerOk;

  const f = useRef({ active: false, contacted: false, started: false, failed: false, complete: false, ack: false, cancelled: false }).current;
  const waiters = useRef(new Set()).current;
  const notify = () => waiters.forEach((w) => w());
  const waitFor = (...preds) => new Promise((resolve) => {
    const check = () => { if (preds.some((p) => p())) { waiters.delete(check); resolve(); } };
    waiters.add(check); check();
  });
  const clearFlags = () => { f.cancelled = false; f.contacted = false; f.started = false; f.complete = false; f.ack = false; };

  // controller -> flags
  useEffect(() => subscribe((d) => {
    if ("ofprobe_ok" in d) { setCenterOk(d.ofprobe_ok); R.current.centerOk = d.ofprobe_ok; }
    if ("ofprobe_dz" in d) setCenterDz(d.ofprobe_dz);
    if (f.active) {
      if ("pw" in d && probeActive({ ...R.current.state, ...d })) f.contacted = true;
      if (d.log?.msg === "Switch not found") { f.failed = true; setFailed(true); }
      if (d.cycle !== undefined) {
        if (d.cycle !== "idle") f.started = true;
        else if (f.started) { f.started = false; f.complete = true; }
      }
    }
    notify();
  }), [subscribe]);
  useEffect(() => { if (probeActive(state) && f.active) { f.contacted = true; notify(); } }, [state.pw, state.pt]);

  const executeProbe = () => {
    const { config, rotary, type, loc, dia: d } = R.current;
    const cfg = rotary ? config["probe-rotary"] : config.probe;
    const w = cfg["probe-xdim"], l = cfg["probe-ydim"], zOffset = cfg["probe-zdim"], slow = cfg["probe-slow-seek"], fast = cfg["probe-fast-seek"];
    const cutterLength = 12.7, zLift = 1, cd = d.mm;
    const xOffset = w + cd / 2, yOffset = l + cd / 2;
    const S = R.current.send;
    if (type === "z") {
      S(`
                G21
                G92 Z0

                G38.2 Z -25.4 F${fast}
                G91 G1 Z 1
                G38.2 Z -2 F${slow}
                G92 Z ${zOffset}

                G91 G0 Z 25

                M2
            `);
      return;
    }
    const plunge = Math.min(cutterLength, zOffset * 0.9) + zLift;
    if (rotary) {
      S(`
                  G21
                  G92 X0 Y0 Z0

                  G38.2 Z -25 F${fast}
                  G91 G1 Z 1
                  G38.2 Z -2 F${slow}
                  G92 Z ${zOffset}

                  G91 G0 Z ${zLift}
                  G91 G0 X 20
                  G91 G0 Z ${-plunge}
                  G38.2 X -20 F${fast}
                  G91 G1 X 1
                  G38.2 X -2 F${slow}
                  G92 X ${xOffset}

                  G91 G0 X 1
                  G91 G0 Y 20
                  G91 G0 X -20
                  G38.2 Y -20 F${fast}
                  G91 G1 Y 1
                  G38.2 Y -2 F${slow}
                  G92 Y ${yOffset}

                  G91 G0 Y 3
                  G91 G0 Z 25

                  M2
              `);
      return;
    }
    const sx = loc === "front-right" || loc === "back-right" ? -1 : 1;
    const sy = loc === "back-left" || loc === "back-right" ? -1 : 1;
    const rotated90 = loc === "front-right" || loc === "back-left";
    const xOff = rotated90 ? yOffset : xOffset, yOff = rotated90 ? xOffset : yOffset;
    const keepY = loc === "center-x";
    S(`
                G21
                ${keepY ? "G92 X0 Z0" : "G92 X0 Y0 Z0"}
${cornerProbeSequence({ sx, sy, plunge, zLift, fastSeek: fast, slowSeek: slow, afterZ: `G92 Z ${zOffset}`, afterX: `G92 X ${sx * xOff}`, afterY: `G92 Y ${sy * yOff}`, remember: loc === "center" || keepY, probeY: !keepY })}
                M2
            `);
  };

  // Second placement for center probing: mirror of the first, then take the midpoints.
  const executeCenterSecondProbe = () => {
    const { config, loc, dia: d } = R.current;
    const cfg = config.probe;
    const h = cfg["probe-zdim"], slow = cfg["probe-slow-seek"], fast = cfg["probe-fast-seek"];
    const zLift = 1, plunge = Math.min(12.7, h * 0.9) + zLift, r = d.mm / 2;
    const keepY = loc === "center-x";
    const leftDim = cfg["probe-xdim"], rightDim = keepY ? cfg["probe-ydim"] : cfg["probe-xdim"], frontDim = cfg["probe-ydim"], backDim = cfg["probe-ydim"];
    const halfX = `[[#5061 - #<_ofprobe_xa> + ${leftDim} + ${rightDim}] / 2 + ${r}]`;
    const halfY = `[[#5062 - #<_ofprobe_ya> + ${frontDim} + ${backDim}] / 2 + ${r}]`;
    const rest = cornerProbeSequence({
      sx: -1, sy: -1, plunge, zLift, fastSeek: fast, slowSeek: slow, afterZ: "",
      afterX: `#<_ofprobe_hx> = ${halfX}
                G92 X [[#5061 - #<_ofprobe_xa> + ${leftDim} - ${rightDim}] / 2]`,
      afterY: `#<_ofprobe_hy> = ${halfY}
                G92 Y [[#5062 - #<_ofprobe_ya>] / 2]`,
      probeY: !keepY,
    }).replace(/^\s*G38\.2 Z -25 F\S+\n\s*G91 G1 Z 1\n\s*G38\.2 Z -2 F\S+\n/, "");
    R.current.send(`
            G21
            G38.2 Z -25 F${fast}
            G91 G1 Z 1
            G38.2 Z -2 F${slow}
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
  };

  // The whole probing procedure, step by step.
  useEffect(() => {
    let dead = false;
    const stepDone = async (name, list, ...preds) => {
      if (dead) throw new Error("cancelled");
      setStep(name);
      if (!list.includes(name)) return;
      clearFlags();
      if (name === "Probe") executeProbe();
      if (name === "Probe2") executeCenterSecondProbe();
      await waitFor(...preds, () => f.cancelled);
      if (f.cancelled) throw new Error("cancelled");
    };
    (async () => {
      try {
        f.active = true; f.failed = false; setFailed(false);
        const safety = config.settings["probing-prompts"];
        const locationStep = isXYZ && !rotary;
        let list = [
          safety && !rotary ? "CheckProbe" : null, isXYZ ? "BitDimensions" : null, locationStep ? "ProbeLocation" : null,
          safety ? "PlaceProbeBlock" : null, "Probe", locationStep ? "MoveProbeBlock" : null, locationStep ? "Probe2" : null, "Done",
        ].filter(Boolean);
        setSteps(list);
        const ack = () => f.ack, contacted = () => f.contacted, complete = () => f.complete, fail = () => f.failed;
        if (!rotary) await stepDone("CheckProbe", list, contacted);
        if (isXYZ) {
          await stepDone("BitDimensions", list, ack);
          lset(rotary ? "cutterDiameterRotary" : "cutterDiameter", normDia(rotary ? R.current.diaRotStr : R.current.diaStr));
        }
        if (locationStep) {
          await stepDone("ProbeLocation", list, ack);
          lset(locKey, R.current.loc);
          if (isCenterLoc(R.current.loc)) { setCenterOk(null); setCenterDz(null); R.current.centerOk = null; }
          else { list = list.filter((s) => s !== "MoveProbeBlock" && s !== "Probe2"); setSteps(list); }
        }
        await stepDone("PlaceProbeBlock", list, ack);
        await stepDone("Probe", list, complete, fail);
        if (f.failed) { await stepDone("Done", list, ack); return; }
        await stepDone("MoveProbeBlock", list, ack);
        await stepDone("Probe2", list, complete, fail);
        await stepDone("Done", list, ack);
        if (usesLocation && isCenterLoc(R.current.loc) && R.current.centerOk === 0) return;
        // Remember where zero was set so the Run check can compare it with the program's setup sheet
        if (usesLocation) {
          const st = R.current.state || {};
          remotePut("probe", { loc: R.current.loc, time: Date.now(), off: { x: st.offset_x ?? null, y: st.offset_y ?? null, z: st.offset_z ?? null } });
        }
        if (isXYZ) R.current.send(rotary ? "G90\nG0 Y0" : "G90\nG0 X0Y0");
      } catch (e) {
        if (e.message !== "cancelled") console.error("Error during probing:", e);
      } finally {
        f.active = false; setStep("None");
        if (f.started) api.put("stop").catch(() => {});
        clearFlags(); onClose();
      }
    })();
    return () => { dead = true; f.cancelled = true; notify(); };
  }, []);

  R.current.diaStr = dia; R.current.diaRotStr = diaRot;

  const curDia = rotary ? parseDia(diaRot) : parseDia(dia);
  const nextDisabled = step === "CheckProbe" || step === "Probe" || step === "Probe2" || (step === "BitDimensions" && !curDia) || step === "None";
  const stepNo = steps.indexOf(step) + 1;
  const isCenter = usesLocation && isCenterLoc(loc), isCenterX = usesLocation && loc === "center-x";
  const jog = (axis, dir) => send(`\n            G91 G0 ${axis}${dir * jogStep}\n            G90\n        `);
  const labels = { ...LABELS, PlaceProbeBlock: rotary ? "Start probe" : LABELS.PlaceProbeBlock, ProbeLocation: isCenterButton ? "Which side?" : LABELS.ProbeLocation };

  const placeText = () => {
    if (usesLocation && loc === "front-right") return "Place the probe block face up on the front-right corner of your workpiece, rotated so its lips hang over the front and right edges.";
    if (usesLocation && loc === "back-left") return "Place the probe block face up on the back-left corner of your workpiece, rotated so its lips hang over the back and left edges.";
    if (usesLocation && loc === "back-right") return "Place the probe block face up on the back-right corner of your workpiece, rotated so its lips hang over the back and right edges.";
    if (usesLocation && loc === "center-x") return "First placement: put the probe block face up on the lower-left (front-left) corner, just like a normal XYZ probe. Only Z and the left end are probed; Y is kept from your earlier setup.";
    if (usesLocation && loc === "center") return "First placement: put the probe block face up on the lower-left (front-left) corner of your workpiece, just like a normal XYZ probe.";
    if (isXYZ && !rotary) return "Place the probe block face up, on the lower-left corner of your workpiece.";
    if (isXYZ && rotary) return "You are about to start probing the rotary. Position the bit above the probe and attach the probe magnet.";
    return "Place the probe block face down, with the bit above the recess.";
  };

  const title = isCenterButton ? "Probing center" : `Probing ${type.toUpperCase()}${rotary ? " (rotary)" : ""}`;
  const showCancel = step !== "Done";
  return (
    <Modal title={title} wide dismissable={false} onClose={() => { f.cancelled = true; notify(); }}
      actions={<>
        {showCancel && <button onClick={() => { f.cancelled = true; notify(); }}>Cancel</button>}
        <button data-autofocus className="primary" disabled={nextDisabled} onClick={() => { if (step === "Done") { f.ack = true; notify(); } else { f.ack = true; notify(); } }}>{step === "Done" ? "Done" : "Next"}</button>
      </>}>
      <div className="probe">
        <ol className="probe-steps" aria-label="Probing steps">
          <li className="count">Step {Math.max(stepNo, 1)} of {steps.length || 1}</li>
          {steps.map((s) => <li key={s} className={s === step ? "active" : ""}>{labels[s]}</li>)}
        </ol>
        <div className="probe-main">
          {step === "CheckProbe" && <><p>Attach the probe magnet to the collet, then touch the probe block to the bit.</p><Svg data={isXYZ ? CheckXYZ : CheckZ} w={300} /></>}
          {step === "BitDimensions" && <>
            <div className="stack">
              <label className="stack">Cutter diameter
                <select data-autofocus value={diaMode === "custom" ? "custom" : normDia(rotary ? diaRot : dia) || PRESET_BITS[0]}
                  onChange={(e) => {
                    const v = e.target.value; const set = rotary ? setDiaRot : setDia;
                    if (v === "custom") { set(""); setDiaMode("custom"); } else { set(v); setDiaMode("preset"); }
                  }}>
                  {PRESET_BITS.map((b) => <option key={b} value={b}>{b}</option>)}
                  <option value="custom">Other size (type it in)</option>
                </select>
              </label>
              {diaMode === "custom" && (
                <label className="stack">Size
                  <input ref={customRef} spellCheck="false" autoComplete="off" placeholder="for example 6 mm or 0.2 in" value={rotary ? diaRot : dia} aria-invalid={!curDia}
                    onChange={(e) => (rotary ? setDiaRot(e.target.value) : setDia(e.target.value))} />
                  <small>Examples: 3/16", 6 mm, 0.25 in</small>
                </label>
              )}
            </div>
            <Svg data={BitDiameter} w={150} />
          </>}
          {step === "ProbeLocation" && <>
            <p>{isCenterButton ? "Which side are you probing?" : "Which corner should be the XY origin?"}</p>
            <div className="radios">{locations.map(([v, label]) => <label key={v}><input type="radio" name="loc" value={v} checked={loc === v} onChange={() => setLoc(v)} /> {label}</label>)}</div>
            {loc === "center" && <p className="dim">Two placements: front-left, then back-right. No stock size is needed; the center is measured.</p>}
            {loc === "center-x" && <p className="dim">Front-left, then front-right. With the same long edge against the fixed jaw (for example the second side after an end-for-end flip): finds the X center from the two ends along the front edge and sets Z. The Y origin is left exactly as it was.</p>}
          </>}
          {step === "PlaceProbeBlock" && <>
            <p>{placeText()}</p>
            {!rotary && (!usesLocation || loc === "front-left" || loc === "center" || loc === "center-x") && <Svg data={isXYZ ? PlaceXYZ : PlaceZ} w={304} />}
            <p>The probing procedure will begin as soon as you click Next.</p>
          </>}
          {step === "Probe" && <><p>Probing in progress…</p><div className="indet" /></>}
          {step === "MoveProbeBlock" && <>
            <p>{isCenterX
              ? <>Second placement: put the probe block on the <b>front-right</b> corner, rotated so its lips hang over the front and right edges. Both ends are then touched along the front edge, the edge that sits against the fixed jaw.</>
              : <>Second placement: put the probe block on the <b>back-right</b> corner, rotated 180 degrees so its lips hang over the back and right edges.</>}</p>
            <p>Then jog the bit over the block's <b>{isCenterX ? "left" : "front-left"}</b> corner, a few mm above it: the mirror of where you start the first probe (about 5 to 15 mm in from {isCenterX ? "its left edge" : "both of those edges"}). Keep the probe magnet on the collet.</p>
            <div className="probe-jog">
              <div className="radios inline">Step: {[10, 1].map((v) => <label key={v}><input type="radio" name="js" checked={jogStep === v} onChange={() => setJogStep(v)} /> {v} mm</label>)}</div>
              <div className="jgrid">
                <span /><button onClick={() => jog("Y", 1)}>Y+ (back)</button><span /><button onClick={() => jog("Z", 1)}>Z+ (up)</button>
                <button onClick={() => jog("X", -1)}>X− (left)</button><span /><button onClick={() => jog("X", 1)}>X+ (right)</button><span />
                <span /><button onClick={() => jog("Y", -1)}>Y− (front)</button><span /><button onClick={() => jog("Z", -1)}>Z− (down)</button>
              </div>
            </div>
            <p>{isCenterX ? "Click Next to probe: Z on the block top, then the left face only. Y is not changed." : "Click Next to probe: Z on the block top, then the left and front faces."}</p>
          </>}
          {step === "Probe2" && <><p>Probing the second corner…</p><div className="indet" /></>}
          {step === "Done" && (failed ? <>
            <h3>Emergency stop</h3><p>Could not find the probe block during probing.</p>
            <p>Make sure the tip of the bit is less than {metric ? "25 mm" : "1 in"} above the probe block, and try again.</p>
          </> : <>
            <p>{rotary ? "Probing complete." : "Don't forget to put away the probe!"}</p>
            {!rotary && <Svg data={isXYZ ? PutAwayXYZ : PutAwayZ} w={329} />}
            {isXYZ && (rotary ? <p>The machine will now move to the Y origin.</p> : <p>
              {isCenter && centerOk === 0 ? <><b>Second placement rejected.</b> The two Z touches differed by {Math.abs(centerDz ?? 0).toFixed(2)} mm (limit 0.5 mm), so the bit stopped before moving sideways. The X/Y origin was NOT moved to the center. Check the block is on the back-right corner and the stock size is right, then probe again.</>
                : isCenterX ? "X0 is now the center between the two ends; Y0 is unchanged from your earlier setup. The machine will now move there."
                : isCenter ? "The XY origin is now the center of the stock. The machine will now move there."
                : "The machine will now move to the XY origin."}
            </p>)}
            {isXYZ && <p><b>Watch your hands!</b></p>}
          </>)}
        </div>
      </div>
    </Modal>
  );
}
