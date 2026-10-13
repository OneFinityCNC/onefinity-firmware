import React, { useEffect, useRef, useState } from "react";
import { Modal } from "./ui.jsx";
import { api } from "./controller.js";
import { remotePut } from "./store.js";
import { getPrefs, setPrefs } from "./checkpoint.js";
import { readSetup } from "./setup.js";
import { probeActive, setterProgram, refStatus } from "./setter.js";
import { getSetter, saveSetter, setterArgs } from "./ToolSetter.jsx";
import { MEASURE_DEFAULTS, FAILS, ORIGINS_XY, ORIGINS_X, checkOpts, measureProgram, calibratedBall } from "./measure.js";

// Measure stock with a 3D touch probe: finds the top and the real edges,
// reports the size and sets the work zero.  See measure.js for the program.

const STEPS = { setup: "Setup", check: "Check probe", place: "Position", run: "Measuring", setter: "Tool setter", done: "Result" };
const CORNERS = new Set(["center", "front-left", "front-right", "back-left", "back-right"]);

export default function MeasureStock({ config, state, send, subscribe, metric, onClose }) {
  const u = metric ? 1 : 25.4;                    // display unit -> mm
  const unit = metric ? "mm" : "in";
  const show = (mm, p = 3) => (mm / u).toFixed(metric ? p : p + 1);

  const [step, setStep] = useState("setup");
  const [calib, setCalib] = useState(false);
  const [p, setP] = useState(null);               // saved settings (mm)
  const [form, setForm] = useState({ w: "", l: "", trueW: "" });
  const [adv, setAdv] = useState(false);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [jogStep, setJogStep] = useState(10);
  const [setter, setSetter] = useState(null);
  const [useSetter, setUseSetter] = useState(true);
  const [seenOpen, setSeenOpen] = useState(false);
  const R = useRef({ started: false, failed: false, state });
  R.current.state = state;

  useEffect(() => {
    (async () => {
      const prefs = await getPrefs();
      getSetter().then(setSetter);
      const m = { ...MEASURE_DEFAULTS, probeY: false, origin: "center-x", w: 0, l: 0, ...(prefs.measure || {}) };
      let w = m.w, l = m.l;
      try {
        const sheet = await readSetup(state.selected);
        if (sheet?.stock) {
          w = sheet.stock.x.max - sheet.stock.x.min; l = sheet.stock.y.max - sheet.stock.y.min;
          if (sheet.corner && CORNERS.has(sheet.corner)) { m.origin = sheet.corner; m.probeY = true; }
          setHint(`Size and zero filled in from the setup sheet of ${state.selected}.`);
        }
      } catch {}
      setP(m);
      setForm({ w: w ? show(w, 2) : "", l: l ? show(l, 2) : "", trueW: "" });
    })();
  }, []);

  // Watch the controller while the program runs
  useEffect(() => subscribe((d) => {
    if (d.log?.msg === "Switch not found") R.current.failed = true;
    if (d.cycle !== undefined && R.current.running) {
      if (d.cycle !== "idle") R.current.started = true;
      else if (R.current.started) { R.current.running = false; setTimeout(() => (R.current.phase === "setter" ? R.current.finishSetter() : R.current.finish()), 400); }
    }
  }), [subscribe]);

  const edit = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const mmOf = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v * u : NaN; };

  const opts = p && {
    ...p,
    w: calib ? mmOf(form.trueW) : mmOf(form.w),
    l: mmOf(form.l),
    probeY: calib ? false : p.probeY,
    origin: calib ? "center-x" : p.origin,
    calibrate: calib,
    fast: config.probe["probe-fast-seek"], slow: config.probe["probe-slow-seek"],
  };
  const errs = opts ? checkOpts(opts) : [];
  const origins = p?.probeY ? ORIGINS_XY : ORIGINS_X;

  const start = () => {
    R.current.started = false; R.current.failed = false; R.current.running = true; R.current.phase = "measure";
    setStep("run");
    setPrefs({ measure: { ...p, w: calib ? p.w : opts.w, l: opts.l || p.l } });
    send(measureProgram(opts));
  };

  const finish = () => {
    const s = R.current.state;
    const ok = s.ofm_ok === 1 && !R.current.failed;
    const res = { ok, fail: R.current.failed ? "edge" : s.ofm_fail, w: s.ofm_w, l: s.ofm_l };
    if (ok && calib) {
      res.ball = calibratedBall(s.ofm_rxa, s.ofm_rxb, opts.w);
      res.ballOk = res.ball > 0.3 && res.ball < 10;
    }
    if (ok && !calib) {
      remotePut("probe", { loc: opts.origin, time: Date.now(), off: { x: s.offset_x ?? null, y: opts.probeY ? s.offset_y ?? null : null, z: s.offset_z ?? null }, measured: { w: s.ofm_w, l: opts.probeY ? s.ofm_l : null } });
    }
    if (ok && !calib && setterOn) {
      // Reference the tool setter with the probe while its Z zero is fresh
      setResult(res);
      setStep("setter");
      Object.assign(R.current, { started: false, failed: false, running: true, phase: "setter" });
      send(setterProgram(setterArgs(s, config, setter, "ref")));
      return;
    }
    setResult(res);
    setStep("done");
  };

  const finishSetter = () => {
    const s = R.current.state;
    const ok = s.ofs_ok === 1 && !R.current.failed;
    if (ok) {
      const n = { ...setter, ref: { ref: s.ofs_ref, offZ: s.offset_z, time: Date.now(), by: "probe" } };
      setSetter(n); saveSetter(n);
    }
    setResult((r) => ({ ...r, setter: ok ? "ok" : R.current.failed ? "notfound" : "fail" }));
    setStep("done");
  };

  R.current.finish = finish;
  R.current.finishSetter = finishSetter;

  const saveBall = () => { const b = Math.round(result.ball * 1000) / 1000; edit("ball", b); setPrefs({ measure: { ...p, ball: b } }); setCalib(false); setStep("setup"); setResult(null); };

  // Wait for the stylus to be touched before any motion
  const touched = probeActive(state);
  useEffect(() => {
    if (step !== "check") { setSeenOpen(false); return; }
    if (!touched) setSeenOpen(true);
    else if (seenOpen) setStep("place");
  }, [step, touched, seenOpen]);
  const setterOn = !calib && useSetter && !!setter && typeof setter.x === "number";

  const jog = (axis, dir) => send(`G21\nG91 G0 ${axis}${dir * jogStep * u}\nG90\n`);
  const stop = () => { R.current.running = false; api.put("stop").catch(() => {}); onClose(); };
  const list = ["setup", "check", "place", "run", ...(setterOn ? ["setter"] : []), "done"];

  const num = (k, label, help) => (
    <label className="stack">{label}
      <input type="number" step="any" value={p[k] === undefined ? "" : (k === "travel" ? p[k] : +(p[k] / u).toFixed(4))}
        onChange={(e) => edit(k, k === "travel" ? +e.target.value : +e.target.value * u)} />
      {help && <small>{help}</small>}
    </label>
  );

  return (
    <Modal title={calib ? "Calibrate the stylus" : "Measure stock"} wide dismissable={false} onClose={stop}
      actions={<>
        {step !== "done" && <button onClick={stop}>Cancel</button>}
        {step === "setup" && <button className="primary" data-autofocus disabled={!p || errs.length > 0} onClick={() => setStep("check")}>Next</button>}
        {step === "place" && <button className="primary" data-autofocus disabled={touched} onClick={start}>{calib ? "Measure the block" : "Measure"}</button>}
        {step === "done" && result?.ok && calib && result.ballOk && <button className="primary" data-autofocus onClick={saveBall}>Save {show(result.ball)} {unit}</button>}
        {step === "done" && <button className={result?.ok && !calib ? "primary" : ""} onClick={onClose}>Done</button>}
      </>}>
      <div className="probe">
        <ol className="probe-steps" aria-label="Steps">
          <li className="count">Step {list.indexOf(step) + 1} of {list.length}</li>
          {list.map((s) => <li key={s} className={s === step ? "active" : ""}>{STEPS[s]}</li>)}
        </ol>
        <div className="probe-main">
          {step === "setup" && p && (calib ? <>
            <p>Clamp a block you know the exact width of (a 1-2-3 block, a gauge block, or a part you measured with calipers) with its ends free. The machine touches both ends and works out the effective size of the stylus ball. Work zero is not changed.</p>
            <div className="stack">
              <label className="stack">Exact X width of the block ({unit})
                <input type="number" step="any" data-autofocus value={form.trueW} onChange={(e) => setForm((f) => ({ ...f, trueW: e.target.value }))} /></label>
            </div>
            <p><button onClick={() => setCalib(false)}>Back to measuring</button></p>
          </> : <>
            <p>Measures the top and the real edges of the stock with a 3D touch probe, then sets the work zero. Only the stylus touches the stock; swap to your cutter afterwards and probe Z as usual.</p>
            {hint && <p className="dim">{hint}</p>}
            <div className="measure-grid">
              <label className="stack">Approximate X size ({unit})
                <input type="number" step="any" value={form.w} onChange={(e) => setForm((f) => ({ ...f, w: e.target.value }))} /></label>
              {p.probeY && <label className="stack">Approximate Y size ({unit})
                <input type="number" step="any" value={form.l} onChange={(e) => setForm((f) => ({ ...f, l: e.target.value }))} /></label>}
            </div>
            <small className="dim">Within {show(p.margin, 0)} {unit} is close enough.</small>
            <label className="check"><input type="checkbox" checked={!!p.probeY} onChange={(e) => { const on = e.target.checked; setP((x) => ({ ...x, probeY: on, origin: on ? "center" : "center-x" })); }} /> Also touch the front and back faces (only when they stand above the vise jaws and clamps)</label>
            <label className="stack">Set zero at
              <select value={p.origin} onChange={(e) => edit("origin", e.target.value)}>
                {origins.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            {setter && typeof setter.x === "number" && <label className="check"><input type="checkbox" checked={useSetter} onChange={(e) => setUseSetter(e.target.checked)} /> Then touch the tool setter with the probe, so each cutter can be measured there (no touch plate)</label>}
            <p className="dim">Stylus ball: {show(p.ball)} {unit} <button onClick={() => { setCalib(true); }}>Calibrate stylus…</button></p>
            <button className="quiet" onClick={() => setAdv((a) => !a)}>{adv ? "Hide" : "Show"} advanced settings</button>
            {adv && <div className="measure-grid">
              {num("ball", `Stylus ball diameter (${unit})`, "Set by Calibrate stylus.")}
              {num("clear", `Travel height above the top (${unit})`, "Raise it if clamps stand above the stock.")}
              {num("depth", `Touch depth below the top (${unit})`, "Must be less than the stock thickness.")}
              {num("margin", `Drop distance outside the edge (${unit})`, "How far off the typed size can be.")}
              {num("travel", "Travel speed (mm/min)", "Guarded moves stop on any touch.")}
            </div>}
          </>)}
          {step === "setup" && errs.length > 0 && p && <ul className="plain err">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}

          {step === "check" && <>
            <p>Put the 3D probe in the collet and plug it in.</p>
            <p><b>Push the stylus sideways with your finger.</b> This step moves on by itself when the controller sees the touch.</p>
            <div className="indet" />
            {touched && !seenOpen ? <p className="err">The probe input already reads as touched. With normally-closed wiring that means the loop is open: plug the probe in (and the setter), or fit the shorting plug.</p>
              : <p className="dim">Nothing happening? Check the probe cable, and that the probe input type under I/O matches your probe (normally open or normally closed).</p>}
          </>}

          {step === "place" && <>
            <p>Jog the stylus over the <b>middle</b> of the {calib ? "block" : "stock"}, about 3 to 15 {metric ? "mm" : "mm (⅛ to ½ in)"} above the top. It doesn't need to be exact.</p>
            <div className="probe-jog">
              <div className="radios inline">Step: {[10, 1].map((v) => <label key={v}><input type="radio" name="mjs" checked={jogStep === v} onChange={() => setJogStep(v)} /> {v} {unit}</label>)}</div>
              <div className="jgrid">
                <span /><button onClick={() => jog("Y", 1)}>Y+ (back)</button><span /><button onClick={() => jog("Z", 1)}>Z+ (up)</button>
                <button onClick={() => jog("X", -1)}>X− (left)</button><span /><button onClick={() => jog("X", 1)}>X+ (right)</button><span />
                <span /><button onClick={() => jog("Y", -1)}>Y− (front)</button><span /><button onClick={() => jog("Z", -1)}>Z− (down)</button>
              </div>
            </div>
            <div className="why"><b>What happens next</b><p>The stylus touches the top, lifts {show(opts.clear, 0)} {unit}, then drops {show(opts.margin, 0)} {unit} outside each {calib || !opts.probeY ? "end" : "edge"} and touches it {show(opts.depth, 0)} {unit} below the top. Any unexpected touch stops it.</p></div>
          </>}

          {step === "setter" && <><p>Touching the tool setter with the probe…</p><div className="indet" /></>}
          {step === "run" && <><p>Measuring…</p><div className="indet" /><p className="dim">Cancel stops the machine.</p></>}

          {step === "done" && result && (result.ok ? (calib ? <>
            <h3>Stylus ball: {show(result.ball)} {unit}</h3>
            {result.ballOk ? <p>Save it to use it for every measurement from now on. Run this again if you change the stylus.</p>
              : <p className="err">That isn't a believable stylus size. Check the width you typed and that the block's ends are square, then try again.</p>}
          </> : <>
            <h3>{show(result.w)}{opts.probeY ? ` × ${show(result.l)}` : ""} {unit}</h3>
            <p>Measured {opts.probeY ? "X × Y" : "X length"}{Number.isFinite(opts.w) ? ` (you typed ${show(opts.w, 2)}${opts.probeY ? ` × ${show(opts.l, 2)}` : ""})` : ""}.</p>
            <p>Zero is set: Z on the top, {origins.find(([v]) => v === opts.origin)?.[1].replace(/ \(.*\)$/, "").toLowerCase()} for {opts.probeY ? "X and Y" : "X (Y not changed)"}. The stylus is parked over it.</p>
            {result.setter === "ok" ? <div className="why"><b>Next: take the probe out</b><p>Put your cutter in, open <b>Tool setter</b> and press <b>Measure tool</b>. Z zero follows the cutter; X and Y stay as measured.</p></div>
              : result.setter ? <div className="why bad"><b>The tool setter reference didn't work</b><p>{result.setter === "notfound" ? "The probe didn't reach the setter and the controller stopped with an E-stop. Check the setter position and cable." : "The setter routine stopped early."} The stock measurement and zero are fine. Put your cutter in and use Probe Z, or fix the setter and take a reference from the Tool setter screen.</p></div>
              : <div className="why"><b>Next: take the probe out</b><p>Put your cutter in and run <b>Probe Z</b>. X and Y stay as measured.</p></div>}
          </>) : <>
            <h3>Stopped</h3>
            {result.fail === "edge" ? <>
              <p>An edge wasn't where it should be, so the controller stopped with an emergency stop. The stock may be smaller than the size you typed, or the touch depth is deeper than the stock is thick.</p>
              <p>Clear the E-stop, then try again.</p>
            </> : <p>{FAILS[result.fail] || "The measurement didn't finish."}</p>}
            <p className="dim">Work zero was not changed.</p>
          </>)}
        </div>
      </div>
    </Modal>
  );
}
