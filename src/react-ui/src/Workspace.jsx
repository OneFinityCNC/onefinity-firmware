import React, { useState } from "react";
import DepthView from "./DepthView.jsx";
import PathView from "./PathView.jsx";
import GCode from "./GCode.jsx";
import Files from "./Files.jsx";
import Mdi from "./Mdi.jsx";
import Messages from "./Messages.jsx";
import Indicators from "./Indicators.jsx";
import Camera from "./Camera.jsx";
import History from "./History.jsx";
import Notes from "./Notes.jsx";
import { useNote } from "./notes.js";

const TABS = [["depth", "Depth view"], ["path", "Tool path"], ["gcode", "G-code"], ["files", "Files"], ["mdi", "MDI"], ["notes", "Notes"], ["history", "History"], ["messages", "Messages"], ["indicators", "Indicators"], ["camera", "Camera"]];

export default function Workspace({ lines, state, path, pathBusy, send, mach, cfg, idle, logs, clearLogs }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("next-work") || "depth"; } catch { return "depth"; } });
  const hasNote = !!useNote(state.selected);
  const pick = (t) => { setTab(t); try { localStorage.setItem("next-work", t); } catch {} };
  return (
    <div className="work">
      <div className="tabs" role="tablist" aria-label="Workspace">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => pick(id)}>{label}{id === "notes" && hasNote ? <i className="badge note-dot" /> : null}{id === "messages" && logs.some((l) => l.level === "error") ? <i className="badge" /> : null}</button>
        ))}
      </div>
      <div className="pane">
        {tab === "depth" && <DepthView path={path} busy={pathBusy} file={state.selected} />}
        {tab === "path" && <PathView path={path} busy={pathBusy} state={state} />}
        {tab === "gcode" && <GCode state={state} lines={lines} />}
        {tab === "files" && <Files state={state} cfg={cfg} idle={idle} />}
        {tab === "mdi" && <Mdi state={state} send={send} mach={mach} />}
        {tab === "notes" && <Notes file={state.selected} />}
        {tab === "history" && <History />}
        {tab === "messages" && <Messages logs={logs} clear={clearLogs} />}
        {tab === "indicators" && <Indicators state={state} send={send} />}
        {tab === "camera" && <Camera state={state} cfg={cfg} idle={idle} />}
      </div>
    </div>
  );
}
