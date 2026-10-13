import React, { useEffect, useState } from "react";
import { Modal } from "./ui.jsx";
import { api } from "./controller.js";
import { computeAxis } from "./axis.js";
import { getPrefs, setPrefs, errText } from "./checkpoint.js";

const Row = ({ k, v }) => <div className="rrow"><dt>{k}</dt><dd>{v}</dd></div>;

// Builds a program that continues the interrupted job and loads it.
export default function ResumeDialog({ cp, state, config, metric, onClose }) {
  const [prefs, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(null);
  useEffect(() => { getPrefs().then(setP); }, []);

  const axes = config ? ["x", "y", "z"].map((a) => computeAxis(state, config, a, metric)) : [];
  const homed = axes.length > 0 && axes.every((a) => a.homed);
  const idle = state.cycle === "idle";
  const edit = (k, v) => setP((p) => ({ ...p, [k]: v }));

  const build = async () => {
    setBusy(true); setErr("");
    try {
      await setPrefs({ spinup: prefs.spinup, plunge: prefs.plunge, pause: prefs.pause });
      setInfo(await api.put("next-resume", { action: "build", opts: { spinup: +prefs.spinup, plunge: +prefs.plunge, pause: !!prefs.pause } }));
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  if (info) {
    const p = info.pos || {};
    const u = info.units;
    return (
      <Modal title="Resume program ready" onClose={onClose} actions={<button className="primary" data-autofocus onClick={onClose}>Close</button>}>
        <p><b>{info.file}</b> is loaded. Check the points below, then press Run in the Job panel.</p>
        <dl className="rdl">
          <Row k="Restarts at line" v={`${info.line}: ${info.line_text}`} />
          {info.located && <Row k="Found from" v={info.saved_line !== info.line ? `where the tool is now (saved line was ${info.saved_line})` : "where the tool is now, which matches the saved line"} />}
          <Row k="Start point" v={["x", "y", "z"].filter((a) => p[a] !== undefined).map((a) => `${a.toUpperCase()} ${p[a]}`).join("   ") + ` ${u}`} />
          <Row k="Tool" v={info.tool !== null && info.tool !== undefined ? `T${info.tool} must be in the spindle` : "not set by the program"} />
          <Row k="Spindle" v={info.spindle === "off" ? "off at this point" : `${info.spindle} ${Math.round(info.speed || 0)} rpm, ${info.spinup} s to reach speed`} />
          <Row k="Before cutting" v={info.pause ? "Z lifts to the top, the tool moves over the start point and the job pauses so you can check it" : "Z lifts to the top and the tool moves over the start point"} />
        </dl>
        {!info.offset_ok && <p className="warnbox">Your work zero is not where it was when the job was interrupted ({Object.entries(info.offset_delta).map(([a, d]) => `${a.toUpperCase()} off by ${d}`).join(", ")}). Set the zero again before running, or the cut will be in the wrong place.</p>}
        {info.warnings.map((w, i) => <p key={i} className="warnbox">{w}</p>)}
        <p className="note">The tool is lowered slowly to the start point and assumes Z0 is the top of the stock. Resume is accurate to how repeatably the machine homes, so use it for roughing and pocketing, and check finishing passes.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Resume job" onClose={onClose} actions={<>
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={busy || !prefs || !homed || !idle} onClick={build}>{busy ? "Building…" : "Build resume program"}</button>
    </>}>
      <p>Continue <b>{cp.file}</b> from line {Number(cp.line).toLocaleString()}. This writes a new program that moves to the restart point, starts the spindle and carries on. If the tool is still on the program's path, the restart point is found from where the tool is, which can be ahead of the saved line. Nothing moves until you press Run.</p>
      <ol className="rsteps">
        <li className={homed ? "ok" : "todo"}>{homed ? "Machine is homed." : "Home the machine first (X, Y and Z). The saved point is only valid after homing."}</li>
        <li>Put the same tool back in the spindle{cp.tool ? <> (T{cp.tool})</> : null} and make sure the stock has not moved.</li>
        <li>Work zero must be the same as before. It is restored when you home, and checked when the program is built.</li>
      </ol>
      {prefs && (
        <div className="rform">
          <label>Spindle spin-up wait (seconds)<input type="number" min="0" max="120" value={prefs.spinup} onChange={(e) => edit("spinup", e.target.value)} /></label>
          <label>Plunge speed (mm/min)<input type="number" min="10" max="5000" value={prefs.plunge} onChange={(e) => edit("plunge", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={!!prefs.pause} onChange={(e) => edit("pause", e.target.checked)} /> Pause over the start point so I can check it</label>
        </div>
      )}
      {err && <p className="warnbox" role="alert">{err}</p>}
    </Modal>
  );
}
