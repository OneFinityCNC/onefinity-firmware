import React, { useState } from "react";
import { api } from "./controller.js";
import { computeAxis, fmtLen } from "./axis.js";
import { Modal, Confirm } from "./ui.jsx";

const STATUS_TEXT = { HOMED: "Homed", UNHOMED: "Not homed", FAULT: "Motor fault", SHUTDOWN: "Power shutdown" };
const FIT_TEXT = { OVER: "Over limit", UNDER: "Under limit", "NO FIT": "Won't fit" };

function PositionDialog({ axis, metric, onClose, title, label, action, initial = "0" }) {
  const [v, setV] = useState(initial);
  const ok = v.trim() !== "" && isFinite(Number(v));
  const go = () => { if (!ok) return; const n = Number(v); action(metric ? n : n * 25.4); onClose(); };
  return (
    <Modal title={title} onClose={onClose} actions={<>
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!ok} onClick={go}>Set</button>
    </>}>
      <label className="stack">{label}
        <input data-autofocus type="number" inputMode="decimal" step="any" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <small>{metric ? "mm" : "in"}</small>
      </label>
    </Modal>
  );
}

function Row({ a, metric, idle, setDlg }) {
  const A = a.axis.toUpperCase();
  const neg = a.pos < 0;
  const frac = isFinite(a.max - a.min) && a.max !== a.min ? Math.min(1, Math.max(0, (a.abs - a.min) / (a.max - a.min))) : 0;
  const bad = a.status === "FAULT" || a.status === "SHUTDOWN";
  return (
    <div className="axis">
      <div className="axis-top">
        <span className="axis-name">{A}</span>
        <button className={`axis-val${neg ? " neg" : ""}`} disabled={!idle} onClick={() => setDlg({ kind: "pos", a })}
          title={`Set the ${A} position`} aria-label={`${A} position ${fmtLen(a.pos, metric)}. Click to set.`}>{fmtLen(a.pos, metric)}</button>
      </div>
      <div className="travel" role="img" aria-label={`${A} travel`}>
        <div className="travel-track"><i style={{ left: `${frac * 100}%` }} /></div>
        {isFinite(a.min) && isFinite(a.max) && <div className="travel-ends"><span>{fmtLen(a.min, metric)}</span><span>{fmtLen(a.max, metric)}</span></div>}
      </div>
      <div className="axis-actions">
        <button disabled={!idle} onClick={() => api.put(`position/${a.axis}`, { position: 0 })}>Zero {A}</button>
        <button disabled={!idle} onClick={() => (a.homingMode === "manual" ? setDlg({ kind: "home", a }) : api.put(`home/${a.axis}`))}>{a.homed ? "Re-home" : "Home"}</button>
        {a.homed && <button className="quiet" disabled={!idle} onClick={() => api.put(`home/${a.axis}/clear`)} title="Forget that this axis is homed">Unhome</button>}
        <span className={`flag ${bad ? "bad" : a.homed ? "ok" : "warn"}`}>{STATUS_TEXT[a.status]}</span>
        {FIT_TEXT[a.fit] && <span className={`flag ${a.fit === "NO FIT" ? "bad" : "warn"}`} title={a.fitMsg}>{FIT_TEXT[a.fit]}</span>}
      </div>
    </div>
  );
}

export default function Dro({ state, config, metric, idle }) {
  const [dlg, setDlg] = useState(null);
  const all = ["x", "y", "z", "a"].map((x) => computeAxis(state, config, x, metric));
  let rows = all.filter((a) => a.enabled);
  if (!rows.length) rows = all.slice(0, 3);
  const anyUnhomed = rows.some((a) => !a.homed);
  return (
    <div className="dro">
      {rows.map((a) => <Row key={a.axis} a={a} metric={metric} idle={idle} setDlg={setDlg} />)}
      <div className="dro-foot">
        <button disabled={!idle} className={anyUnhomed ? "primary" : ""} onClick={() => api.put("home")}>Home all</button>
        <button disabled={!idle} onClick={() => rows.forEach((a) => api.put(`position/${a.axis}`, { position: 0 }))}>Zero all</button>
      </div>
      {dlg?.kind === "pos" && (
        <PositionDialog title={`Set ${dlg.a.axis.toUpperCase()} position`} label={`New ${dlg.a.axis.toUpperCase()} value`} metric={metric}
          initial={String(Number(fmtLen(dlg.a.pos, metric)))} onClose={() => setDlg(null)}
          action={(mm) => api.put(`position/${dlg.a.axis}`, { position: mm })} />
      )}
      {dlg?.kind === "home" && (
        <PositionDialog title={`Set ${dlg.a.axis.toUpperCase()} home`} metric={metric}
          label={`Jog ${dlg.a.axis.toUpperCase()} to its home position, then enter the value it should read there`}
          initial="0" onClose={() => setDlg(null)} action={(mm) => api.put(`home/${dlg.a.axis}/set`, { position: mm })} />
      )}
    </div>
  );
}
