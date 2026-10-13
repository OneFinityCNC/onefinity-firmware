import React, { useState } from "react";
import { api } from "./controller.js";

export default function Mdi({ state, send, mach }) {
  const [text, setText] = useState("");
  const [hist, setHist] = useState(() => { try { return JSON.parse(localStorage.getItem("next-mdi") || "[]"); } catch { return []; } });
  const can = state.cycle === "idle" || state.cycle === "mdi";
  const running = mach === "RUNNING", holding = mach === "HOLDING" || mach === "STOPPING";
  const submit = () => {
    if (!text.trim()) return;
    send(text);
    const h = [text, ...hist.filter((x) => x !== text)].slice(0, 30);
    setHist(h); try { localStorage.setItem("next-mdi", JSON.stringify(h)); } catch {}
    setText("");
  };
  return (
    <div className="mdi">
      <div className="mdi-row">
        <input value={text} disabled={!can} placeholder="Type G-code, for example G0 X10 Y10" aria-label="G-code command" spellCheck="false"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {running ? <button className="hold" onClick={() => api.put("pause")}>Pause</button>
          : holding ? <button className="go" onClick={() => api.put("unpause")}>Resume</button>
          : <button className="go" disabled={!can || !text.trim()} onClick={submit}>Run</button>}
        <button className="halt" onClick={() => api.put("stop")}>Stop</button>
      </div>
      <p className="dim">The machine is working in <b>{state.metric === false ? "imperial" : "metric"}</b> units. Use G20 or G21 to switch.</p>
      {hist.length === 0 ? <p className="empty">Commands you run appear here. Click one to reuse it.</p> : (
        <ul className="hist">{hist.map((h, i) => <li key={i}><button onClick={() => setText(h)}>{h}</button></li>)}</ul>
      )}
    </div>
  );
}
