import React, { useState } from "react";
import { isInterrupted } from "./checkpoint.js";
import ResumeDialog from "./ResumeDialog.jsx";

const WHY = { running: "The controller lost power or restarted during the job.", estop: "The job ended with an E-stop.", stopped: "The job was stopped before it finished.", parked: "The job was parked so the machine could be powered off." };

export default function Interrupted({ cp, busy, onDismiss, state, config, metric }) {
  const [open, setOpen] = useState(false);
  if (busy || !isInterrupted(cp)) return null;
  const when = new Date(cp.t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <>
    <div className="interrupted" role="status">
      <div>
        <b>{cp.status === "parked" ? "Parked job" : "Interrupted job"}: {cp.file}</b>
        <span> Last saved at line {Number(cp.line).toLocaleString()}{cp.nlines ? ` of ${cp.nlines.toLocaleString()}` : ""}, {when}. {WHY[cp.status]}</span>
        <small>Resume continues from the saved line, or from where the tool is if it is still on the program path. After a power loss or E-stop, home the machine first.</small>
      </div>
      <div className="irow">
        <button className="primary" onClick={() => setOpen(true)}>Resume…</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
    {open && <ResumeDialog cp={cp} state={state} config={config} metric={metric} onClose={() => setOpen(false)} />}
    </>
  );
}
