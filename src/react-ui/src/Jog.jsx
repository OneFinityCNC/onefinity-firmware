import { probeActive } from "./setter.js";
import React, { useEffect, useRef, useState } from "react";
import { api } from "./controller.js";
import { Confirm } from "./ui.jsx";

const STEPS = {
  metric: [["Fine", 0.1], ["Small", 1], ["Medium", 10], ["Large", 100]],
  imperial: [["Fine", 0.005], ["Small", 0.05], ["Medium", 0.5], ["Large", 5]],
};
const SPEEDS = [1, 5, 10, 25, 50, 100];
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export default function Jog({ state, config, send, metric, locked, idle, onProbe, ready }) {
  const [idx, setIdx] = useState(Number(read("next-jog-idx", 1)));
  const [mode, setMode] = useState(read("next-jog-mode", "step") === "hold" ? "hold" : "step");
  const [spd, setSpd] = useState(Math.min(Number(read("next-jog-spd", 2)) || 0, SPEEDS.length - 1));
  const held = useRef(null), lastTs = useRef(0);
  const [armed, setArmed] = useState(null);
  const [macroErr, setMacroErr] = useState("");
  const stRef = useRef(state); stRef.current = state;
  const [ask, setAsk] = useState(null);
  const steps = STEPS[metric ? "metric" : "imperial"];
  const amt = steps[idx][1];
  const unit = metric ? "mm" : "in";
  const rotaryOn = state["2an"] === 3;
  const rotaryAvail = state["2an"] === 1 || state["2an"] === 3;

  const pick = (i) => { setIdx(i); try { localStorage.setItem("next-jog-idx", i); } catch {} };
  const jog = (x, y, z, a = 0) => {
    const part = (l, d) => (d ? `${l}${+(d * amt).toFixed(4)}` : "");
    send(`M70\nG91\n${metric ? "G21" : "G20"}\nG0 ${part("X", x)}${part("Y", y)}${part("Z", z)}${part("A", a)}\nM72`);
  };

  // Hold mode: velocity jog. The controller moves while we keep re-sending the command; if the
  // updates stop for 0.6 s (browser closed, network lost) its watchdog zeroes the jog.
  const sendJog = (vel) => {
    const ts = Math.max(Date.now(), lastTs.current + 1); lastTs.current = ts;
    api.put("jog", { ts, keepalive: true, ...vel }).catch(() => {});
  };
  const stopHold = () => {
    const h = held.current; if (!h) return;
    clearInterval(h.timer); held.current = null;
    const zero = {}; for (const k of Object.keys(h.vel)) zero[k] = 0;
    sendJog(zero); setTimeout(() => sendJog(zero), 120);
  };
  const startHold = (x, y, z, a) => {
    stopHold();
    const p = SPEEDS[spd] / 100, vel = {};
    if (x) vel.x = x * p; if (y) vel.y = y * p; if (z) vel.z = z * p; if (a) vel.a = a * p;
    held.current = { vel, timer: setInterval(() => sendJog(vel), 200) };
    sendJog(vel);
  };
  const stopRef = useRef(stopHold); stopRef.current = stopHold;
  useEffect(() => {
    const stop = () => stopRef.current();
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop); window.addEventListener("pagehide", stop); document.addEventListener("visibilitychange", hidden);
    return () => { stop(); window.removeEventListener("blur", stop); window.removeEventListener("pagehide", stop); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  useEffect(() => { if (locked) stopRef.current(); }, [locked]);
  const pickMode = (m) => { stopHold(); setMode(m); try { localStorage.setItem("next-jog-mode", m); } catch {} };
  const pickSpd = (i) => { stopHold(); setSpd(i); try { localStorage.setItem("next-jog-spd", i); } catch {} };

  const macros = (state.macros || config?.macros || []).filter((m) => m && m.file_name && m.file_name !== "default");
  const runMacro = async (m, i) => {
    if (m.alert !== false && armed !== i) { setArmed(i); setTimeout(() => setArmed((a) => (a === i ? null : a)), 5000); return; }
    setArmed(null); setMacroErr("");
    try {
      // Opening the file selects it on the controller; wait until the controller reports it before starting.
      const r = await fetch(`/api/file/${encodeURIComponent(m.file_name)}`);
      if (!r.ok) throw new Error(`The macro file ${m.file_name} could not be opened.`);
      for (let n = 0; n < 40 && stRef.current.selected !== m.file_name; n++) await new Promise((ok) => setTimeout(ok, 50));
      await api.put("start");
    } catch (e) {
      let msg = e.message || String(e);
      try { msg = JSON.parse(msg).message || msg; } catch {}
      setMacroErr(`${m.name} did not start: ${msg}`);
      setTimeout(() => setMacroErr(""), 10000);
    }
  };

  const K = ({ x = 0, y = 0, z = 0, a = 0, cls, children, label }) => mode === "hold" ? (
    <button className={`k hk ${cls}`} disabled={locked} aria-label={`${label} (hold)`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startHold(x, y, z, a); }}
      onPointerUp={stopHold} onPointerCancel={stopHold} onLostPointerCapture={stopHold}
      onContextMenu={(e) => e.preventDefault()}>{children}</button>
  ) : (
    <button className={`k ${cls}`} disabled={locked} aria-label={label} onClick={() => jog(x, y, z, a)}>{children}</button>
  );

  return (
    <div className="jog">
      <div className="modes" role="radiogroup" aria-label="Jog mode">
        <button role="radio" aria-checked={mode === "step"} className={mode === "step" ? "on" : ""} onClick={() => pickMode("step")}>Step</button>
        <button role="radio" aria-checked={mode === "hold"} className={mode === "hold" ? "on" : ""} onClick={() => pickMode("hold")}>Hold</button>
      </div>
      {mode === "step" ? (
        <div className="steps" role="radiogroup" aria-label="Step size">
          {steps.map(([name, v], i) => (
            <button key={name} role="radio" aria-checked={i === idx} className={i === idx ? "on" : ""} onClick={() => pick(i)}>
              <b>{v}</b><small>{name}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="steps six" role="radiogroup" aria-label="Hold jog speed">
          {SPEEDS.map((v, i) => (
            <button key={v} role="radio" aria-checked={i === spd} className={i === spd ? "on" : ""} onClick={() => pickSpd(i)}>
              <b>{v}%</b><small>of max</small>
            </button>
          ))}
        </div>
      )}

      <div className="pads">
        <div className="xy">
          <K x={-1} y={1} cls="d nw" label="X minus, Y plus">↖</K>
          <K y={1} cls="up" label="Y plus">Y+</K>
          <K x={1} y={1} cls="d ne" label="X plus, Y plus">↗</K>
          <K x={-1} cls="left" label="X minus">X−</K>
          <button className="k mid" disabled={locked} onClick={() => setAsk("xy")} title="Move to X0 Y0">X0 Y0</button>
          <K x={1} cls="right" label="X plus">X+</K>
          <K x={-1} y={-1} cls="d sw" label="X minus, Y minus">↙</K>
          <K y={-1} cls="down" label="Y minus">Y−</K>
          <K x={1} y={-1} cls="d se" label="X plus, Y minus">↘</K>
        </div>
        <div className="z">
          <K z={1} cls="" label="Z up">Z+</K>
          <div className="zl">{mode === "hold" ? `${SPEEDS[spd]}%` : `${amt} ${unit}`}</div>
          <K z={-1} cls="" label="Z down">Z−</K>
          {rotaryOn && <div className="arow"><K a={-1} cls="" label="A minus">A−</K><K a={1} cls="" label="A plus">A+</K></div>}
        </div>
      </div>

      <div className="probes">
        <button disabled={!ready} className={probeActive(state) ? "contact" : ""} onClick={() => onProbe("xyz")}>Probe XYZ</button>
        <button disabled={!ready} className={probeActive(state) ? "contact" : ""} onClick={() => onProbe("z")}>Probe Z</button>
        {!rotaryOn && <button disabled={!ready} onClick={() => onProbe("center")}>Probe center</button>}
        {!rotaryOn && <button disabled={!ready} onClick={() => onProbe("measure")} title="Measure the stock with a 3D touch probe">Measure stock</button>}
        <button disabled={!ready} onClick={() => onProbe("setter")} title="Measure a tool on the tool setter">Tool setter</button>
        <button disabled={locked} onClick={() => setAsk("z")} title="Move to Z0">Z0</button>
        {rotaryOn && <button disabled={locked} onClick={() => setAsk("a")} title="Move A to zero">A0</button>}
        {rotaryAvail && <button disabled={!idle} className={rotaryOn ? "on" : ""} onClick={() => setAsk("rotary")}>Rotary {rotaryOn ? "on" : "off"}</button>}
      </div>

      {macros.length > 0 && (
        <div className="macros" aria-label="Macros">
          {macros.map((m, i) => (
            <button key={i} disabled={!ready} className={armed === i ? "armed" : ""} style={{ "--m": m.color || "var(--blue)" }} onClick={() => runMacro(m, i)}>
              {armed === i ? "Tap again to run" : m.name}
            </button>
          ))}
          {macroErr && <p className="macro-err" role="alert">{macroErr}</p>}
        </div>
      )}

      {ask && ask !== "rotary" && (
        <Confirm title={`Move to ${ask === "xy" ? "X0 Y0" : ask === "z" ? "Z0" : "A0"}?`} confirmLabel="Move"
          onCancel={() => setAsk(null)} onConfirm={() => { send(`G90\nG0 ${ask === "xy" ? "X0Y0" : ask === "z" ? "Z0" : "A0"}`); setAsk(null); }}>
          <p>The machine will move straight there. Check that the tool is clear of clamps and stock.</p>
        </Confirm>
      )}
      {ask === "rotary" && (
        <Confirm title="Switch rotary mode" confirmLabel="Yes"
          onCancel={() => setAsk(null)} onConfirm={async () => { setAsk(null); try { await api.put("rotary", { status: !rotaryOn }); } catch (e) { alert("Could not switch rotary mode"); } }}>
          <p>{rotaryOn ? "Turn off the rotary box?" : "Turn on the rotary box?"}</p>
        </Confirm>
      )}
    </div>
  );
}
