import React from "react";
import { useRuns, clearRuns } from "./history.js";
import { fmtTime } from "./axis.js";

export default function History() {
  const runs = useRuns();
  const total = runs.filter((r) => r.status === "Finished").reduce((a, r) => a + r.runMs, 0);
  if (!runs.length) return <p className="empty">Programs you run from this page are listed here, with how long each took and how it ended.</p>;
  return (
    <div className="history">
      <p className="note">Saved on the controller, so every device sees it. {runs.filter((r) => r.status === "Finished").length} finished runs, {fmtTime(total / 1000)} of run time in total.</p>
      <table className="grid-table">
        <thead><tr><th>Started</th><th>Program</th><th>Run time</th><th>Result</th></tr></thead>
        <tbody>{runs.slice(0, 50).map((r, i) => (
          <tr key={i} className={r.status === "Finished" ? "" : "bad-row"}>
            <th>{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</th>
            <td title={r.file}>{r.file || "(none)"}</td><td>{fmtTime(r.runMs / 1000)}</td><td>{r.status}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="btnrow"><button onClick={clearRuns}>Clear history</button></div>
    </div>
  );
}
