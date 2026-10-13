import { useRunTracker, markStopped } from "./history.js";
import { explain } from "./explain.js";
import React, { useEffect, useState, useCallback } from "react";
import { useController, useConfig, metricOf, api } from "./controller.js";
import { Modal, Confirm } from "./ui.jsx";
import ControlPage from "./ControlPage.jsx";
import { Settings, IO, Tool, Motors } from "./pages1.jsx";
import { Macros, Admin, useLatestVersion } from "./pages2.jsx";
import { CheatSheet, Help } from "./pages3.jsx";
import { computeAxis } from "./axis.js";

export function machState(state) {
  const { cycle, xx } = state;
  if (xx !== "ESTOPPED" && (cycle === "jogging" || cycle === "homing")) return cycle.toUpperCase();
  return xx || "";
}
function statusText(state, mach) {
  if (mach === "ESTOPPED") return state.er || "Emergency stop";
  if (mach === "HOLDING") return state.pr || "Paused";
  const m = state.messages;
  return m && m.length ? m[m.length - 1].text.replace(/^#/, "") : "";
}
const TONE = { READY: "ready", RUNNING: "run", HOMING: "run", JOGGING: "run", STOPPING: "warn", HOLDING: "warn", ESTOPPED: "stop" };

const TABS = [["control", "Control"], ["macros", "Macros"], ["settings", "Settings"], ["motors", "Motors"], ["tool", "Tool"], ["io", "I/O"], ["admin", "Admin"], ["cheat-sheet", "Cheat sheet"], ["help", "Help"]];

function parseHash() {
  const h = (location.hash || "").replace(/^#/, "");
  const [a, b] = h.split(":");
  if (a === "motor") return { page: "motors", index: Number(b) || 0 };
  if (a === "admin-network") return { page: "admin", sub: "network" };
  if (a === "admin-general" || a === "admin") return { page: "admin", sub: "general" };
  if (TABS.some(([id]) => id === a)) return { page: a };
  return { page: "control" };
}

export default function App() {
  const ctl = useController();
  const { state, online, send } = ctl;
  useRunTracker(state);
  const cfg = useConfig(state);
  const [route, setRoute] = useState(parseHash());
  const [power, setPower] = useState(false);
  const [askHome, setAskHome] = useState(false);
  const [homeAsked, setHomeAsked] = useState(false);
  const [errSeen, setErrSeen] = useState(0);
  const ver = useLatestVersion(cfg);

  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = useCallback((h) => { location.hash = h; }, []);

  const metric = metricOf(cfg.config);
  const mach = machState(state);
  const tone = TONE[mach] || "idle";
  const estopped = mach === "ESTOPPED";

  // Offer to home once, when the machine is idle and an axis isn't homed.
  useEffect(() => {
    if (homeAsked || !cfg.config || mach !== "READY" || state.cycle !== "idle") return;
    const axes = ["x", "y", "z", "a"].map((a) => computeAxis(state, cfg.config, a, metric)).filter((a) => a.enabled);
    if (axes.length && axes.some((a) => !a.homed)) setAskHome(true);
    setHomeAsked(true);
  }, [homeAsked, cfg.config, mach, state.cycle]);

  // G-code messages (MSG, M0 pauses) need an answer before the program goes on.
  const popups = (state.messages || []).filter((m) => !/^#/.test(m.text));
  const ack = () => { const last = state.messages[state.messages.length - 1]; if (last) api.put(`message/${last.id}/ack`).catch(() => {}); };
  const holding = state.xx === "HOLDING";

  const tabLabel = (id, label) => <>{label}{id === "admin" && ver.newer ? <i className="badge" title={`Upgrade to v${ver.latest} available`} /> : null}{id === "motors" || id === "settings" || id === "tool" || id === "io" ? null : null}</>;

  const { page } = route;
  return (
    <div className="shell">
      <header className="strip">
        <div className={`chip ${tone}`}><span className="dot" />{mach ? mach[0] + mach.slice(1).toLowerCase() : "Connecting"}</div>
        <div className="msg" title={statusText(state, mach)}>{statusText(state, mach)}</div>
        {cfg.config?.settings?.["easy-adapter"] && <span className="pill" title="Easy Adapter is on">Easy Adapter</span>}
        {state.rpi_temp >= 80 && <span className="pill bad" title="Raspberry Pi temperature too high">Pi {Math.round(state.rpi_temp)} °C</span>}
        <button className="unit" disabled={!cfg.config} onClick={() => cfg.edit((c) => { c.settings.units = metric ? "IMPERIAL" : "METRIC"; })} aria-label={`Display units: ${metric ? "millimeters" : "inches"}. Switch.`}>{metric ? "mm" : "in"}</button>
        <div className={`link ${online ? "up" : "down"}`}>{online ? "Connected" : "Offline"}</div>
        {cfg.modified && (
          <div className="savebar">
            <button onClick={() => cfg.discard()}>Discard</button>
            <button className="primary" onClick={async () => { try { await cfg.save(); } catch (e) { alert(`Save failed: ${e.message}`); } }}>Save changes</button>
          </div>
        )}
        {estopped
          ? <button className="estop reset" onClick={() => api.put("clear")}>Clear E-stop</button>
          : <button className="estop" onClick={() => api.put("estop")}>E-stop</button>}
      </header>

      <nav className="nav" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <a key={id} href={`#${id === "admin" ? "admin-general" : id === "motors" ? "motor:0" : id}`} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined}>{tabLabel(id, label)}</a>
        ))}
        <span className="grow" />
        <span className="ver">{cfg.config ? `v${cfg.config.full_version}` : ""}{cfg.net.ip ? ` · ${cfg.net.ip}` : ""}</span>
        <button className="quiet" onClick={() => setPower(true)}>Power</button>
      </nav>
      {mach === "ESTOPPED" && explain(state.er || "User triggered EStop") && (
        <div className="banner" role="alert"><b>{explain(state.er || "User triggered EStop").what}</b> {explain(state.er || "User triggered EStop").advice}</div>
      )}

      {page === "control" && <ControlPage ctl={ctl} cfg={cfg} mach={mach} metric={metric} />}
      {page === "macros" && <Macros cfg={cfg} state={state} />}
      {page === "settings" && <Settings cfg={cfg} metric={metric} />}
      {page === "motors" && <Motors cfg={cfg} state={state} metric={metric} index={route.index || 0} go={go} />}
      {page === "tool" && <Tool cfg={cfg} state={state} metric={metric} send={ctl.send} />}
      {page === "io" && <IO cfg={cfg} state={state} metric={metric} />}
      {page === "admin" && <Admin cfg={cfg} state={state} metric={metric} sub={route.sub || "general"} go={go} ver={ver} />}
      {page === "cheat-sheet" && <CheatSheet />}
      {page === "help" && <Help cfg={cfg} net={cfg.net} />}

      {popups.length > 0 && (
        <Modal title="G-code message" dismissable={false} actions={holding ? <>
          <button onClick={() => { markStopped(); api.put("stop").catch(() => {}); ack(); }}>Stop</button>
          <button data-autofocus className="primary" onClick={() => { api.put("unpause").catch(() => {}); ack(); }}>Continue</button>
        </> : <button data-autofocus className="primary" onClick={ack}>OK</button>}>
          <ul className="plain big">{popups.map((m, i) => <li key={i}>{m.text}</li>)}</ul>
          {popups.some((m) => /tool/i.test(m.text)) && <div className="why"><b>Install tool {state.tool || 0}.</b><p>This is the tool the program selected. Check the tool number before you continue, and re-probe Z if your tool change does that.</p></div>}
        </Modal>
      )}
      {ctl.lastError && ctl.lastError.at !== errSeen && (
        <Modal title="Error" onClose={() => setErrSeen(ctl.lastError.at)} actions={<button data-autofocus className="primary" onClick={() => setErrSeen(ctl.lastError.at)}>OK</button>}>
          <p className="big">{ctl.lastError.msg}</p>
          {explain(ctl.lastError.msg) && <div className="why"><b>{explain(ctl.lastError.msg).what}</b><p>{explain(ctl.lastError.msg).advice}</p></div>}
          <p className="dim">Earlier messages are in the Messages tab on Control.</p>
        </Modal>
      )}
      {askHome && (
        <Confirm title="Home the machine?" confirmLabel="Home" onCancel={() => setAskHome(false)} onConfirm={() => { setAskHome(false); api.put("home").catch(() => {}); }}>
          <p>One or more axes aren't homed yet. Homing moves the machine to its limit switches. Keep hands and tools clear.</p>
        </Confirm>
      )}
      {power && (
        <Modal title="Power" onClose={() => setPower(false)} actions={<>
          <button onClick={() => setPower(false)}>Cancel</button>
          <button className="danger" onClick={() => { api.put("shutdown").catch(() => {}); setPower(false); }}>Shut down</button>
          <button data-autofocus className="primary" onClick={() => { api.put("reboot").catch(() => {}); setPower(false); }}>Restart</button>
        </>}><p>Shut down or restart the controller?</p></Modal>
      )}
      {!online && state.xx !== undefined && <div className="offline-bar" role="status">Lost connection to the controller. Reconnecting…</div>}
    </div>
  );
}
