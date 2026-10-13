import React, { useEffect, useRef, useState } from "react";
import { Modal } from "./ui.jsx";
import { api } from "./controller.js";
import { computeAxis } from "./axis.js";
import { getPrefs, setPrefs } from "./checkpoint.js";
import { SETTER_DEFAULTS, SETTER_FAILS, setterProgram, refStatus, probeActive } from "./setter.js";

// Tool setter screen: save where the setter is, take the reference with a
// tool whose Z zero is right, and measure each new tool so Z stays right.

export async function getSetter() {
  const p = await getPrefs();
  return { ...SETTER_DEFAULTS, ...(p.setter || {}) };
}
export const saveSetter = (s) => setPrefs({ setter: s });

// Runs a setter program and resolves with the controller state when it ends.
export function useProgramRunner(state, subscribe, send) {
  const R = useRef({ state });
  R.current.state = state;
  useEffect(() => subscribe((d) => {
    const r = R.current;
    if (d.log?.msg === "Switch not found" && r.running) r.notFound = true;
    if (d.cycle !== undefined && r.running) {
      if (d.cycle !== "idle") r.started = true;
      else if (r.started) { r.running = false; setTimeout(() => r.resolve({ ...R.current.state, notFound: r.notFound }), 400); }
    }
  }), [subscribe]);
  return (prog) => new Promise((resolve) => {
    Object.assign(R.current, { running: true, started: false, notFound: false, resolve });
    send(prog);
  });
}

export function setterArgs(state, config, setter, mode, ref) {
  const z = computeAxis(state, config, "z", true);
  return {
    mode, ref, setter: { x: setter.x, y: setter.y, z: setter.z },
    top: z.max - 1, back: { x: state.xp || 0, y: state.yp || 0 },
    clear: setter.clear, travel: setter.travel,
    fast: config.probe["probe-fast-seek"], slow: config.probe["probe-slow-seek"],
  };
}

export default function ToolSetter({ config, state, send, subscribe, metric, onClose }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);       // {ok, text}
  const [adv, setAdv] = useState(false);
  const run = useProgramRunner(state, subscribe, send);
  useEffect(() => { getSetter().then(setS); }, []);

  const u = metric ? 1 : 25.4, unit = metric ? "mm" : "in";
  const fmt = (mm) => (mm / u).toFixed(metric ? 3 : 4);
  const homed = !!config && ["x", "y", "z"].every((a) => computeAxis(state, config, a, metric).homed);
  const idle = state.cycle === "idle" && state.xx !== "ESTOPPED";
  const touched = probeActive(state);
  const located = s && typeof s.x === "number";
  const ref = s ? refStatus(s.ref, state) : { ok: false };
  const canMove = homed && idle && !touched && located && !busy;

  const update = (fn) => setS((x) => { const n = fn({ ...x }); saveSetter(n); return n; });

  const saveLocation = () => {
    update((x) => ({ ...x, x: state.xp, y: state.yp, z: state.zp, ref: null }));
    setMsg({ ok: true, text: "Setter position saved. The old reference was cleared: take a new one with a tool whose Z zero is right." });
  };

  const go = async (mode) => {
    setMsg(null); setBusy(mode);
    const res = await run(setterProgram(setterArgs(state, config, s, mode, s.ref?.ref)));
    setBusy("");
    if (res.notFound) { setMsg({ ok: false, text: "The tool didn't reach the setter. The controller stopped with an emergency stop. Check the setter position and its cable, clear the E-stop and try again." }); return; }
    if (res.ofs_ok !== 1) { setMsg({ ok: false, text: SETTER_FAILS[res.ofs_fail] || "The setter routine didn't finish. Z zero was not changed." }); return; }
    if (mode === "ref") {
      update((x) => ({ ...x, ref: { ref: res.ofs_ref, offZ: res.offset_z, time: Date.now(), by: "tool" } }));
      setMsg({ ok: true, text: "Reference taken. From now on, measure each new tool here and Z zero follows it." });
    } else {
      update((x) => ({ ...x, ref: { ...x.ref, offZ: res.offset_z } }));
      setMsg({ ok: true, text: "Tool measured. Z zero is set for this tool, on the same stock top as before." });
    }
  };

  const status = !located ? "Setter position not saved yet."
    : ref.ok ? `Reference taken ${new Date(s.ref.time).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}${s.ref.by === "probe" ? " with the 3D probe after Measure stock" : ""}.`
    : ref.why === "moved" ? "Z zero has been changed since the reference was taken (for example by Probe Z), so the reference no longer matches. Take a new one."
    : "No reference yet.";

  return (
    <Modal title="Tool setter" wide onClose={onClose} actions={<button data-autofocus onClick={onClose}>Close</button>}>
      {!s ? <p>Loading…</p> : <div className="setter">
        <p className={ref.ok ? "" : "dim"}>{status}</p>

        <div className="setter-actions">
          <div>
            <button className="primary big" disabled={!canMove || !ref.ok} onClick={() => go("tool")}>{busy === "tool" ? "Measuring…" : "Measure tool"}</button>
            <small>After a tool change. Sets Z zero for the new tool.</small>
          </div>
          <div>
            <button disabled={!canMove} onClick={() => go("ref")}>{busy === "ref" ? "Measuring…" : "Take reference with this tool"}</button>
            <small>Only when this tool's Z zero is right, for example straight after Probe Z. Measure stock does this for you with the 3D probe.</small>
          </div>
          <div>
            <button disabled={!homed || !idle || !!busy} onClick={saveLocation}>{located ? "Save setter position again" : "Save setter position"}</button>
            <small>Jog the tool over the middle of the setter, about 5 {metric ? "mm" : "mm (¼ in)"} above it, then save. Do this once, and again if you move the setter.</small>
          </div>
        </div>

        {touched && <p className="err">The probe input reads as touched. With normally-closed wiring that also means a probe or setter is unplugged: plug it in, or fit the shorting plug.</p>}
        {!homed && <p className="err">Home the machine first. The setter position is in machine coordinates.</p>}
        {msg && <div className={msg.ok ? "why" : "why bad"}><b>{msg.ok ? "Done" : "Stopped"}</b><p>{msg.text}</p></div>}

        <button className="quiet" onClick={() => setAdv((a) => !a)}>{adv ? "Hide" : "Show"} details</button>
        {adv && <div className="measure-grid">
          <label className="stack">Clearance above the saved height ({unit})
            <input type="number" step="any" value={+(s.clear / u).toFixed(3)} onChange={(e) => update((x) => ({ ...x, clear: +e.target.value * u }))} />
            <small>How much longer a new tool can be than the one used to save the position.</small></label>
          {located && <p className="dim">Setter at machine X {fmt(s.x)}, Y {fmt(s.y)}, Z {fmt(s.z)} {unit}.{s.ref ? ` Reference ${fmt(s.ref.ref)} ${unit}.` : ""}</p>}
        </div>}
      </div>}
    </Modal>
  );
}
