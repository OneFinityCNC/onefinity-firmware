import React, { useEffect, useState } from "react";
import { loadPath, api } from "./controller.js";
import Dro from "./Dro.jsx";
import Jog from "./Jog.jsx";
import Job from "./Job.jsx";
import Interrupted from "./Interrupted.jsx";
import { useCheckpoint } from "./checkpoint.js";
import { useProgram, parseToolChanges } from "./toolplan.js";
import Workspace from "./Workspace.jsx";
import ProbeDialog from "./ProbeDialog.jsx";
import MeasureStock from "./MeasureStock.jsx";
import ToolSetter from "./ToolSetter.jsx";
import { axisEnabled, computeAxis } from "./axis.js";
import { Modal } from "./ui.jsx";

const PROBE_NAMES = { xyz: "Probe XYZ", z: "Probe Z", center: "Probe center", measure: "Measure stock", setter: "Tool setter" };

export default function ControlPage({ ctl, cfg, mach, metric }) {
  const { state, send, subscribe, logs, clearLogs } = ctl;
  const [path, setPath] = useState(null);
  const [pathBusy, setPathBusy] = useState(false);
  const [probe, setProbe] = useState(null);

  useEffect(() => {
    const f = state.selected;
    setPath(null);
    if (!f) return;
    let dead = false;
    setPathBusy(true);
    loadPath(f).then((p) => !dead && setPath(p)).catch(() => {}).finally(() => !dead && setPathBusy(false));
    return () => { dead = true; };
  }, [state.selected, state.selected_time]);

  const lines = useProgram(state);
  const ckpt = useCheckpoint(state);
  const changes = React.useMemo(() => parseToolChanges(lines), [lines]);
  const busy = mach === "RUNNING" || mach === "HOLDING" || mach === "STOPPING" || mach === "HOMING";
  const estopped = mach === "ESTOPPED";
  const idle = state.cycle === "idle";
  const ready = mach === "READY";
  const rotary = state["2an"] === 3;

  // Probing sets work zero relative to home, so it is only allowed on a homed machine. A zero probed before
  // homing moves when the machine is homed later. Asking for a probe on an unhomed machine shows a Home step
  // first, and the probe opens by itself once homing has finished.
  const axes = cfg.config ? ["x", "y", "z"].filter((a) => axisEnabled(state, cfg.config, a)) : [];
  const homed = !!cfg.config && axes.length > 0 && axes.every((a) => computeAxis(state, cfg.config, a, metric).homed);
  const unhomed = cfg.config ? axes.filter((a) => !computeAxis(state, cfg.config, a, metric).homed) : [];
  const [homeFirst, setHomeFirst] = useState(null);
  const [homeErr, setHomeErr] = useState("");
  const requestProbe = (t) => {
    if (!t) { setProbe(null); return; }
    if (homed) setProbe(t); else { setHomeErr(""); setHomeFirst(t); }
  };
  useEffect(() => {
    if (homeFirst && homed && mach !== "HOMING") { setProbe(homeFirst); setHomeFirst(null); }
  }, [homeFirst, homed, mach]);
  const homing = mach === "HOMING";

  return (
    <>
    <Interrupted cp={ckpt.cp} busy={mach === "RUNNING" || mach === "HOLDING" || mach === "STOPPING" || mach === "HOMING"} onDismiss={ckpt.dismiss} state={state} config={cfg.config} metric={metric} />
    <main className="grid">
      <section className="band dro-band"><Dro state={state} config={cfg.config} metric={metric} idle={idle && !estopped} /></section>
      <section className="band jog-band">
        <Jog state={state} config={cfg.config} send={send} metric={metric} locked={busy || estopped} idle={idle && !estopped} ready={ready} onProbe={requestProbe} />
      </section>
      <section className="band job-band"><Job state={state} mach={mach} path={path} metric={metric} config={cfg.config} changes={changes} /></section>
      <section className="band work-band">
        <Workspace lines={lines} state={state} path={path} pathBusy={pathBusy} send={send} mach={mach} cfg={cfg} idle={idle && !estopped} logs={logs} clearLogs={clearLogs} />
      </section>
      {homeFirst && (
        <Modal title="Home the machine first" onClose={homing ? undefined : () => setHomeFirst(null)} dismissable={!homing}
          actions={<>
            <button disabled={homing} onClick={() => setHomeFirst(null)}>Cancel</button>
            <button data-autofocus className="primary" disabled={homing || estopped || !idle}
              onClick={() => { setHomeErr(""); api.put("home").catch((e) => setHomeErr(String(e.message || e))); }}>{homing ? "Homing…" : "Home now"}</button>
          </>}>
          <p className="big">{PROBE_NAMES[homeFirst] || "Probing"} needs a homed machine.</p>
          <p>{unhomed.map((a) => a.toUpperCase()).join(", ")} {unhomed.length === 1 ? "is" : "are"} not homed. Work zero is stored relative to home, so a zero probed now would land in the wrong place as soon as the machine is homed.</p>
          <p>Home now moves every axis to its limit switch, Z first. Take the probe block off the stock and keep hands clear. {PROBE_NAMES[homeFirst] || "The probe"} opens by itself when homing has finished.</p>
          {homeErr && <p className="err">{homeErr}</p>}
          {estopped && <p className="err">Clear the E-stop first.</p>}
        </Modal>
      )}
      {probe === "measure" && cfg.config && (
        <MeasureStock config={cfg.config} state={state} send={send} subscribe={subscribe} metric={metric} onClose={() => setProbe(null)} />
      )}
      {probe === "setter" && cfg.config && (
        <ToolSetter config={cfg.config} state={state} send={send} subscribe={subscribe} metric={metric} onClose={() => setProbe(null)} />
      )}
      {probe && probe !== "measure" && probe !== "setter" && cfg.config && (
        <ProbeDialog type={probe} config={cfg.config} state={state} send={send} subscribe={subscribe} rotary={rotary} metric={metric} onClose={() => setProbe(null)} />
      )}
    </main>
    </>
  );
}
