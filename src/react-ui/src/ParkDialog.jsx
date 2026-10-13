import React, { useState } from "react";
import { Modal, Confirm } from "./ui.jsx";
import { api } from "./controller.js";
import { errText } from "./checkpoint.js";

// "Park and power down": stop, spindle off, lift Z, then it is safe to switch off.
export default function ParkDialog({ state, active, onClose }) {
  const [err, setErr] = useState("");
  const park = async () => { setErr(""); try { await api.put("next-resume", { action: "park" }); } catch (e) { setErr(errText(e)); } };
  const done = () => { api.put("next-resume", { action: "clear" }).catch(() => {}); onClose(); };

  if (state.park === "parking") return <Modal title="Parking…" dismissable={false}><p>Stopping the job, turning the spindle off and lifting Z. Do not switch anything off yet.</p><div className="indet" /></Modal>;
  if (state.park === "parked") return (
    <Modal title="Safe to power off" dismissable={false} actions={<>
      <button onClick={done}>Close</button>
      <button className="danger" data-autofocus onClick={() => { api.put("shutdown").catch(() => {}); onClose(); }}>Shut down controller</button>
    </>}>
      <p>The job is saved at line {Number(state.line || 0).toLocaleString()}, the spindle is off and Z is at the top. When you come back, switch on, home the machine and press <b>Resume</b> on the Control tab.</p>
      <p className="note">Do not move the stock or the machine while it is off. If you change the work zero, the resume point will be wrong.</p>
    </Modal>
  );
  if (state.park === "failed") return <Modal title="Parking failed" onClose={done} actions={<button className="primary" onClick={done}>Close</button>}><p>The machine could not finish parking. Check the message log, then lift Z and turn the spindle off by hand. The job's saved line is still stored.</p></Modal>;
  if (!active) return null;
  return (
    <Confirm title="Park and power down?" confirmLabel="Park" onCancel={onClose} onConfirm={park}>
      <p>This stops the job here, turns the spindle off and lifts Z to the top of its travel. You can then switch the machine off and finish the job later with Resume.</p>
      <p className="note">The cutter is lifted straight up from where it stopped. The line being cut is cut again from its start when you resume.</p>
      {err && <p className="warnbox" role="alert">{err}</p>}
    </Confirm>
  );
}
