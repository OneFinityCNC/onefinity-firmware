import React, { useEffect, useRef, useState } from "react";
import { useDrops, clearDrops } from "./drops.js";
import { getPrefs, setPrefs, useCheckpoint, isInterrupted } from "./checkpoint.js";
import { api, MACRO_PREFIX, DELETE_LIST_PREFIX } from "./controller.js";
import { Page, Group, Modal, Confirm, SubTabs } from "./ui.jsx";

/* ------------------------------------------------------------------ Macros */
const DEFAULTS = Array.from({ length: 8 }, (_, i) => ({ name: `Macro ${i + 1}`, color: "#dedede", file_name: "default", alert: true }));

export function Macros({ cfg, state }) {
  const macros = state.macros || [];
  const files = (state.macros_list || []).map((m) => m.file_name).sort();
  const [idx, setIdx] = useState(-1);
  const [form, setForm] = useState({ name: "", color: "#dedede", alert: true, file: "default", gcode: "" });
  const [dirty, setDirty] = useState(false);
  const [dlg, setDlg] = useState(null);
  const [msg, setMsg] = useState("");
  const up = useRef(null);
  const idle = state.xx === "READY" && state.cycle === "idle";

  const loadGcode = async (file) => {
    if (!file || file === "default") return "";
    const r = await fetch(`/api/file/${MACRO_PREFIX}${encodeURIComponent(file)}`, { cache: "no-cache" });
    if (r.status === 200) return await r.text();
    if (r.status === 400) { setDlg("missing"); return ""; }
    throw new Error("error loading");
  };
  const open = async (i) => {
    setMsg(""); setIdx(i); setDirty(false);
    if (i < 0) { setForm({ name: "", color: "#dedede", alert: true, file: "default", gcode: "" }); return; }
    const m = macros[i];
    try { setForm({ name: m.name, color: m.color, alert: m.alert !== false, file: m.file_name, gcode: await loadGcode(m.file_name) }); } catch (e) { setMsg(e.message); }
  };
  const change = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const clean = (n) => n.replace(/\\/g, "_").replace(/\//g, "_").replace(/#/g, "-").replace(/\?/g, "-");

  const save = async () => {
    setDlg(null);
    if (idx < 0) return;
    if (macros.some((m, i) => i !== idx && m.name === clean(form.name))) { setDlg("samename"); return; }
    let file = form.file;
    if (file !== "default" && !files.includes(file)) file = "default";
    const hasCode = form.gcode.trim() !== "";
    const fileName = file === "default" ? (hasCode ? `${clean(form.name)}.ngc` : "default") : file;
    try {
      if (hasCode) {
        const r = await fetch(`/api/file/${MACRO_PREFIX}${encodeURIComponent(fileName)}`, { method: "PUT", body: form.gcode });
        if (!r.ok) throw new Error(await r.text());
      }
      await cfg.save((c) => {
        c.macros_list = c.macros_list || [];
        if (hasCode && !c.macros_list.some((x) => x.file_name === fileName)) c.macros_list.push({ file_name: fileName });
        c.macros[idx] = { name: form.name, color: form.color, file_name: fileName, alert: form.alert };
      });
      setDirty(false); setForm((f) => ({ ...f, file: fileName })); setMsg("Saved");
    } catch (e) { setMsg(`Save failed: ${e.message}`); }
  };
  const add = async () => {
    setDlg(null);
    if (macros.length >= 20) { setDlg("max"); return; }
    let n = macros.length;
    while (macros.some((m) => m.name === `Macro ${n + 1}`)) n++;
    try { await cfg.save((c) => { c.macros.push({ name: `Macro ${n + 1}`, color: "#dedede", file_name: "default", alert: true }); }); setIdx(macros.length); setForm({ name: `Macro ${n + 1}`, color: "#dedede", alert: true, file: "default", gcode: "" }); } catch (e) { setMsg(e.message); }
  };
  const remove = async () => {
    setDlg(null);
    try { await cfg.save((c) => { c.macros.splice(idx, 1); }); await open(-1); } catch (e) { setMsg(e.message); }
  };
  const resetAll = async () => {
    setDlg(null);
    const nonMacro = (state.non_macros_list || []).map((x) => x.file_name);
    const toDelete = (state.macros_list || []).filter((x) => !nonMacro.includes(x.file_name)).map((x) => x.file_name);
    try {
      if (toDelete.length) await api.del(`file/${DELETE_LIST_PREFIX}${toDelete.join(",")}`);
      await cfg.save((c) => { c.macros = DEFAULTS.map((d) => ({ ...d })); c.macros_list = []; });
      await open(-1);
    } catch (e) { setMsg(e.message); }
  };
  const upload = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["nc", "ngc", "gcode", "gc"].includes(ext)) { setMsg(`${file.name} is not a G-code file (.nc, .ngc, .gcode, .gc).`); return; }
    const text = await file.text();
    change({ file: file.name, gcode: text });
    try {
      await fetch(`/api/file/${MACRO_PREFIX}${encodeURIComponent(file.name)}`, { method: "PUT", body: text });
      await cfg.save((c) => { c.macros_list = c.macros_list || []; if (!c.macros_list.some((x) => x.file_name === file.name)) c.macros_list.push({ file_name: file.name }); });
    } catch (e) { setMsg(`Upload failed: ${e.message}`); }
  };
  const deleteGcode = async () => {
    setDlg(null);
    const f = form.file; if (f === "default") { change({ gcode: "" }); return; }
    try {
      await cfg.save((c) => {
        for (const m of c.macros) if (m.file_name === f) m.file_name = "default";
        c.macros_list = (c.macros_list || []).filter((x) => x.file_name !== f);
      });
      if (!(state.non_macros_list || []).some((x) => x.file_name === f)) await api.del(`file/${encodeURIComponent(f)}`);
      setForm((x) => ({ ...x, file: "default", gcode: "" }));
    } catch (e) { setMsg(e.message); }
  };

  return (
    <Page title="Macros" actions={<>
      <button disabled={!idle} onClick={() => setDlg("add")}>New macro</button>
      <button disabled={!idle || idx < 0} onClick={() => setDlg("remove")}>Delete macro</button>
      <button disabled={!idle} onClick={() => setDlg("reset")}>Reset all</button>
    </>}>
      <p className="dim">Macros appear as buttons on the Control tab. Each runs a G-code program. Pick one to edit it.</p>
      <div className="macro-chips" role="tablist" aria-label="Macros">
        {macros.map((m, i) => (
          <button key={i} role="tab" aria-selected={idx === i} className={idx === i ? "on" : ""} style={{ "--m": m.color }} onClick={() => open(i)}>{m.name}</button>
        ))}
        {macros.length === 0 && <span className="dim">No macros yet.</span>}
      </div>

      {idx < 0 ? <p className="empty">Select a macro above to edit its name, color and G-code.</p> : (
        <div className="cols">
          <Group title="Macro">
            <div className="field"><label htmlFor="mn">Name</label><div className="ctl">
              <input id="mn" type="color" aria-label="Button color" value={form.color} onChange={(e) => change({ color: e.target.value })} className="color" />
              <input id="mn" maxLength={15} value={form.name} onChange={(e) => change({ name: e.target.value })} /></div></div>
            <div className="field"><label htmlFor="ma">Confirm before running</label><div className="ctl"><input id="ma" type="checkbox" className="switch" checked={form.alert} onChange={(e) => change({ alert: e.target.checked })} /></div>
              <p className="hint">Ask for a second tap on the button before the macro runs.</p></div>
            <div className="field"><label htmlFor="mf">G-code file</label><div className="ctl">
              <select id="mf" value={form.file} disabled={!idle} onChange={async (e) => { const file = e.target.value; setDirty(true); setForm((f) => ({ ...f, file })); try { setForm((f) => ({ ...f, gcode: "" })); const g = await loadGcode(file); setForm((f) => ({ ...f, gcode: g })); } catch {} }}>
                <option value="default">Write G-code below</option>{files.map((f) => <option key={f} value={f}>{f}</option>)}</select>
              <button disabled={!idle} onClick={() => up.current.click()}>Upload</button>
              <button disabled={!idle || form.file === "default"} onClick={() => setDlg("delcode")}>Delete file</button>
              <input ref={up} type="file" hidden accept=".nc,.ngc,.gcode,.gc" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} /></div></div>
          </Group>
          <Group title="G-code">
            <textarea className="code-edit" rows={14} spellCheck="false" aria-label="Macro G-code" value={form.gcode} onChange={(e) => change({ gcode: e.target.value })} />
            <div className="row-end">{msg && <span className="dim">{msg}</span>}<button disabled={!dirty} onClick={() => open(idx)}>Cancel</button><button className="primary" disabled={!dirty} onClick={() => setDlg("save")}>Save macro</button></div>
          </Group>
        </div>
      )}

      {dlg === "save" && <Confirm title="Save this macro?" confirmLabel="Save" onCancel={() => setDlg(null)} onConfirm={save}><p>The button on the Control tab updates as soon as you save.</p></Confirm>}
      {dlg === "add" && <Confirm title="Add a macro?" confirmLabel="Add" onCancel={() => setDlg(null)} onConfirm={add}><p>A new macro is added to the end of the list.</p></Confirm>}
      {dlg === "remove" && <Confirm title="Delete this macro?" danger confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={remove}><p>The macro button is removed. Its G-code file stays on the controller.</p></Confirm>}
      {dlg === "reset" && <Confirm title="Reset all macros?" danger confirmLabel="Reset" onCancel={() => setDlg(null)} onConfirm={resetAll}><p>All macros are replaced with eight empty ones, and macro-only G-code files are deleted.</p></Confirm>}
      {dlg === "delcode" && <Confirm title="Delete this G-code file?" danger confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={deleteGcode}><p>Any macro using <b>{form.file}</b> loses its program and needs a new one.</p></Confirm>}
      {dlg === "samename" && <Modal title="That name is taken" onClose={() => setDlg(null)} actions={<button className="primary" data-autofocus onClick={() => setDlg(null)}>OK</button>}><p>Another macro already uses this name. Choose a different one.</p></Modal>}
      {dlg === "max" && <Modal title="Macro limit reached" onClose={() => setDlg(null)} actions={<button className="primary" data-autofocus onClick={() => setDlg(null)}>OK</button>}><p>You can have up to 20 macros.</p></Modal>}
      {dlg === "missing" && <Modal title="File not found" onClose={() => setDlg(null)} actions={<button className="primary" data-autofocus onClick={() => setDlg(null)}>OK</button>}><p>The controller can't find the G-code file for this macro. Pick another file or write the G-code below.</p></Modal>}
    </Page>
  );
}

/* ------------------------------------------------------------------- Admin */
const VARIANTS = [
  ["machinist_x35", "Machinist X-35 / Original (16x16\")"], ["woodworker_x35", "Woodworker X-35 / Original (32x32\")"],
  ["woodworker_x50", "Woodworker X-50 / Pro (32x32\")"], ["journeyman_x50", "Journeyman X-50 / Pro (48x32\")"], ["foreman_pro", "Foreman Pro (48x48\")"],
];
const Z_SLIDERS = {
  "Z-16 Original": { "travel-per-rev": 4, "min-soft-limit": -133, "max-velocity": 3 },
  "Z-20 Heavy Duty": { "travel-per-rev": 10, "min-soft-limit": -160, "max-velocity": 7 },
};
const deepMerge = (a, b) => { const o = Array.isArray(a) ? [...a] : { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) && a?.[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v; return o; };

function semverLt(a, b) {
  const p = (v) => (v || "").split(/[.-]/).slice(0, 3).map(Number);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) < (y[i] || 0)) return true; if ((x[i] || 0) > (y[i] || 0)) return false; }
  return false;
}

export function useLatestVersion(cfg) {
  const [latest, setLatest] = useState("");
  const check = async () => {
    try { const r = await fetch("https://api.github.com/repos/mikejsmith1985/onefinity-firmware/releases/latest", { cache: "no-cache" }); const rel = await r.json(); const ok = (rel.assets || []).some((x) => /^onefinity-[0-9.]+\.tar\.bz2$/.test(x.name)); setLatest(ok ? String(rel.tag_name).replace(/^v/, "") : ""); } catch { setLatest(""); }
  };
  const auto = cfg.config?.admin?.["auto-check-upgrade"];
  const loaded = !!cfg.config;
  useEffect(() => { if (loaded && (auto === undefined || auto)) check(); }, [loaded]);
  const newer = !!(latest && cfg.config && semverLt(cfg.config.full_version, latest));
  return { latest, check, newer };
}

function General({ cfg, ver, state }) {
  const c = cfg.config;
  const [dlg, setDlg] = useState(null);
  const [variant, setVariant] = useState("");
  const [zs, setZs] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState({ now: null, zone: "", zones: [], loading: true });
  const [sel, setSel] = useState({ zone: "", date: "", h: "", m: "", mer: "AM" });
  const fw = useRef(null), restore = useRef(null);
  const [file, setFile] = useState(null);

  const loadTime = async () => {
    try {
      const r = await api.get("time");
      if (r.timeinfo) {
        const lt = r.timeinfo.match(/Local time:\s+([A-Za-z]{3}\s\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/);
        const tz = r.timeinfo.match(/Time zone:\s*([^ ]*)/);
        setTime({ now: lt ? new Date(lt[1]) : null, zone: tz ? tz[1] : "", zones: (r.timezones || "").split("\n").filter(Boolean), loading: false });
        if (tz) setSel((s) => ({ ...s, zone: tz[1] }));
      } else setTime((t) => ({ ...t, loading: false }));
    } catch { setTime((t) => ({ ...t, loading: false })); }
  };
  useEffect(() => { loadTime(); }, []);

  const fmt = () => {
    if (!time.now) return "Loading…";
    try { const o = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: c.admin.time_format !== true }; if (time.zone) o.timeZone = time.zone; return new Intl.DateTimeFormat("en-US", o).format(time.now); } catch { return "Error loading time"; }
  };
  const setZone = async () => { try { await api.put("time", { timezone: sel.zone }); setNote("Time zone changed."); loadTime(); } catch (e) { setNote(`Time zone change failed: ${e.message}`); } };
  const setDateTime = async () => {
    if (!sel.date || sel.h === "" || sel.m === "") { setNote("Enter the date, hours and minutes."); return; }
    let h = parseInt(sel.h, 10); const mi = parseInt(sel.m, 10);
    if (!c.admin.time_format) { if (sel.mer === "PM" && h !== 12) h += 12; else if (sel.mer === "AM" && h === 12) h = 0; }
    const datetime = `${sel.date} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
    try { await api.put("time", { datetime }); setNote("Date and time updated."); loadTime(); } catch (e) { setNote(`Update failed: ${e.message}`); }
  };

  const backup = () => { const names = (state.macros || []).filter((m) => m.file_name !== "default").map((m) => m.file_name).join(","); const a = document.createElement("a"); a.href = `/api/config/download/${names}`; a.click(); };
  const doRestore = async (f) => {
    if (!f) return; const fd = new FormData(); fd.append("zipfile", f);
    try { const r = await fetch("/api/config/restore", { method: "PUT", body: fd, headers: { Type: "zip" } }); if (!r.ok) throw new Error(await r.text()); setNote("Configuration restored."); await cfg.reload(true); } catch (e) { setNote(`Restore failed: ${e.message}`); }
  };
  const doReset = async () => {
    setDlg(null);
    try {
      const get = (n) => fetch(`/${n}`, { cache: "no-cache" }).then((r) => r.json());
      const [base, v] = await Promise.all([get("onefinity_defaults.json"), get(`onefinity_${variant}_defaults.json`)]);
      const conf = deepMerge(base, v);
      await api.put("config/save", conf); await cfg.reload(true); setDlg("zslider");
    } catch (e) { setNote(`Reset failed: ${e.message}`); }
  };
  const doZ = async () => {
    setDlg(null);
    try { await cfg.save((x) => { x.motors[3] = deepMerge(x.motors[3], Z_SLIDERS[zs]); }); setNote("Z slider set."); } catch (e) { setNote(`Failed to set the Z slider: ${e.message}`); }
  };
  const startUpgrade = async () => { setDlg(null); try { await api.put("upgrade"); setBusy("Firmware upgrading. This should take less than 5 minutes. If it takes longer, restart the controller and try via USB."); } catch (e) { setNote(`Upgrade failed: ${e.message}`); } };
  const startUpload = async () => {
    setDlg(null); const fd = new FormData(); fd.append("firmware", file);
    try { await api.put("firmware/update", fd); setBusy("Firmware upgrading. This should take less than 5 minutes. If it takes longer, restart the controller and try via USB."); } catch (e) { setNote(`Upload failed: ${e.message}`); }
  };

  return (
    <div className="cols">
      <div>
        <Group title="Firmware">
          <p>Installed: <b>v{c.full_version}</b>{ver.latest ? <> · Latest: <b>v{ver.latest}</b></> : null}{ver.newer ? <span className="flag warn"> Upgrade available</span> : null}</p>
          <div className="btnrow">
            <button onClick={ver.check}>Check for upgrade</button>
            <button disabled={!ver.newer} onClick={() => setDlg("upgrade")}>Upgrade via web</button>
            <button onClick={() => fw.current.click()}>Upgrade from file</button>
            <input ref={fw} type="file" hidden accept=".bz2" onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setDlg("upload"); } e.target.value = ""; }} />
          </div>
          <label className="check"><input type="checkbox" checked={c.admin["auto-check-upgrade"] !== false} onChange={(e) => cfg.edit((x) => { x.admin["auto-check-upgrade"] = e.target.checked; })} /> Check for upgrades automatically</label>
        </Group>
        <Group title="Configuration">
          <div className="btnrow">
            <button onClick={backup}>Back up</button>
            <button onClick={() => restore.current.click()}>Restore</button>
            <button className="danger-quiet" onClick={() => setDlg("reset")}>Reset to defaults</button>
            <input ref={restore} type="file" hidden accept=".zip" onChange={(e) => { doRestore(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <p className="dim">Back up saves your settings and macros as a zip file. Reset replaces all non-network settings with the defaults for your machine.</p>
        </Group>
        <Group title="Power-loss recovery">
          <Recovery state={state} />
        </Group>
        <Group title="Connection">
          <Drops />
        </Group>
        <Group title="Debugging">
          <div className="btnrow"><a className="btn" href="/api/log" target="_blank" rel="noreferrer">View log</a><a className="btn" href="/api/bugreport">Bug report</a></div>
        </Group>
      </div>
      <div>
        <Group title="Time zone">
          <p>Current: <b>{time.zone || "unknown"}</b></p>
          <div className="btnrow"><select aria-label="Time zone" value={sel.zone} onChange={(e) => setSel({ ...sel, zone: e.target.value })}>{time.zones.map((z) => <option key={z}>{z}</option>)}</select><button onClick={setZone}>Change time zone</button></div>
        </Group>
        <Group title="Date and time">
          <p>Now: <b>{time.loading ? "Loading…" : fmt()}</b></p>
          <label className="check"><input type="checkbox" checked={c.admin.time_format === true} onChange={async (e) => { const v = e.target.checked; cfg.edit((x) => { x.admin.time_format = v; }); }} /> Use 24-hour format</label>
          <div className="btnrow dt">
            <input type="date" aria-label="Date" value={sel.date} onChange={(e) => setSel({ ...sel, date: e.target.value })} />
            <input type="number" aria-label="Hours" placeholder="HH" min={c.admin.time_format ? 0 : 1} max={c.admin.time_format ? 23 : 12} value={sel.h} onChange={(e) => setSel({ ...sel, h: e.target.value })} />
            <input type="number" aria-label="Minutes" placeholder="MM" min="0" max="59" value={sel.m} onChange={(e) => setSel({ ...sel, m: e.target.value })} />
            <select aria-label="AM or PM" disabled={c.admin.time_format === true} value={sel.mer} onChange={(e) => setSel({ ...sel, mer: e.target.value })}><option>AM</option><option>PM</option></select>
            <button onClick={setDateTime}>Update</button>
          </div>
          <p className="dim">A controller on the internet sets its time automatically. One that is offline needs its time set after every start.</p>
        </Group>
        {note && <p className="note" role="status">{note}</p>}
      </div>

      {dlg === "upgrade" && <Confirm title="Upgrade firmware?" confirmLabel="Upgrade" onCancel={() => setDlg(null)} onConfirm={startUpgrade}><p>Upgrade the firmware to version {ver.latest}?</p></Confirm>}
      {dlg === "upload" && <Confirm title="Upload firmware?" confirmLabel="Upload" onCancel={() => setDlg(null)} onConfirm={startUpload}><p>Upload <em>{file?.name}</em> and install it?</p></Confirm>}
      {dlg === "reset" && (
        <Modal title="Reset to default configuration?" onClose={() => setDlg(null)} actions={<><button onClick={() => setDlg(null)}>Cancel</button><button className="danger" disabled={!variant} onClick={doReset}>Reset</button></>}>
          <p>Non-network configuration changes will be lost. Choose the defaults to restore:</p>
          <div className="radios">{VARIANTS.map(([v, label]) => <label key={v}><input type="radio" name="variant" checked={variant === v} onChange={() => setVariant(v)} /> {label}</label>)}</div>
        </Modal>
      )}
      {dlg === "zslider" && (
        <Modal title="Pick your Z slider type" dismissable={false} actions={<button className="primary" disabled={!zs} onClick={doZ}>Set Z slider</button>}>
          <div className="radios">{Object.keys(Z_SLIDERS).map((v) => <label key={v}><input type="radio" name="zs" checked={zs === v} onChange={() => setZs(v)} /> {v}</label>)}</div>
        </Modal>
      )}
      {busy && <Modal title="Firmware upgrading" dismissable={false}><p><b>Please wait…</b></p><p>{busy}</p></Modal>}
    </div>
  );
}

function Network() {
  const [net, setNet] = useState(null);
  const [err, setErr] = useState("");
  const [dlg, setDlg] = useState(null);
  const [pw, setPw] = useState("");
  const [host, setHost] = useState("");
  const [rebooting, setRebooting] = useState("");
  const load = () => { setErr(""); api.get("network").then(setNet).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  const nets = (() => {
    if (!net) return [];
    const by = {};
    for (const n of net.wifi.networks || []) { if (!n.Name) continue; n.active = net.wifi.ssid === n.Name; if (!by[n.Name] || Number(n.Quality) >= Number(by[n.Name].Quality)) by[n.Name] = n; }
    return Object.values(by).sort((a, b) => (a.active ? -1 : b.active ? 1 : a.Name.localeCompare(b.Name)));
  })();
  const bars = (n) => Math.ceil((Number(n.Quality) / 100) * 4);
  const connect = async () => {
    const n = dlg.net; setRebooting("Rebooting to apply Wi-Fi changes…");
    try { await api.put("network", { wifi: { enabled: !n.active, ssid: n.Name, password: pw } }); } catch (e) { setRebooting(""); setErr(e.message); }
  };
  const rename = async () => {
    setRebooting("Rebooting to apply the new hostname. Reconnect using the new name in about 45 seconds.");
    try { await api.put("hostname", { hostname: host }); await api.put("reboot"); } catch (e) { setRebooting(""); setErr(e.message); }
  };
  return (
    <div className="cols">
      <Group title="This controller">
        <dl className="stats one">
          <div className="stat"><dt>Hostname</dt><dd>{net?.hostname || "—"} <button className="quiet" onClick={() => { setHost(""); setDlg({ kind: "host" }); }}>Change</button></dd></div>
          <div className="stat"><dt>IP address</dt><dd>{net ? [].concat(net.ipAddresses).join(", ") : "—"}</dd></div>
          <div className="stat"><dt>Wi-Fi network</dt><dd>{net?.wifi?.ssid || "Not connected"}</dd></div>
        </dl>
        {err && <p className="err">{err}</p>}
      </Group>
      <Group title="Wi-Fi networks">
        <div className="btnrow"><button onClick={load}>Refresh</button></div>
        {!net ? <p className="dim">Scanning…</p> : nets.length === 0 ? <p className="dim">No networks found.</p> : (
          <ul className="wifi">{nets.map((n) => (
            <li key={n.Name}><button className={n.active ? "on" : ""} onClick={() => { setPw(""); setDlg({ kind: "wifi", net: n }); }}>
              <span className={`bars b${bars(n)}`} aria-label={`Signal ${bars(n)} of 4`}><i /><i /><i /><i /></span>
              <span className="grow">{n.Name}</span>{n.active && <small>Connected</small>}{n.Encryption !== "Open" && <small>Locked</small>}</button></li>
          ))}</ul>
        )}
        <p className="dim">Choose a network to connect or disconnect. The controller reboots to apply the change.</p>
      </Group>
      {dlg?.kind === "wifi" && (
        <Modal title={`${dlg.net.active ? "Disconnect from" : "Connect to"} ${dlg.net.Name}`} onClose={() => setDlg(null)} actions={<><button onClick={() => setDlg(null)}>Cancel</button><button className="primary" onClick={connect}>{dlg.net.active ? "Disconnect" : "Connect"}</button></>}>
          {!dlg.net.active && dlg.net.Encryption !== "Open" && <label className="stack">Password<input data-autofocus type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
          <p className="dim">The controller will reboot.</p>
        </Modal>
      )}
      {dlg?.kind === "host" && (
        <Modal title="Change hostname" onClose={() => setDlg(null)} actions={<><button onClick={() => setDlg(null)}>Cancel</button><button className="primary" disabled={!host} onClick={() => { setDlg(null); rename(); }}>Change and reboot</button></>}>
          <label className="stack">New hostname<input data-autofocus value={host} onChange={(e) => setHost(((e.target.value.match(/[a-zA-Z0-9][a-zA-Z0-9-]{0,62}/) || [""])[0]).toLowerCase())} /><small>Letters, numbers and hyphens. It can't start with a hyphen.</small></label>
        </Modal>
      )}
      {rebooting && <Modal title="Rebooting" dismissable={false}><p>{rebooting}</p></Modal>}
    </div>
  );
}

export function Admin({ cfg, state, metric, sub, go, ver }) {
  if (!cfg.config) return <Page title="Admin"><p className="empty">Loading settings from the controller…</p></Page>;
  return (
    <Page title="Admin">
      <SubTabs items={[["general", "General"], ["network", "Network"]]} value={sub} onChange={(v) => go(`admin-${v}`)} />
      {sub === "network" ? <Network /> : <General cfg={cfg} ver={ver} state={state} />}
    </Page>
  );
}

function Drops() {
  const list = useDrops();
  const day = Date.now() - 86400000;
  const recent = list.filter((d) => d.at > day).length;
  const dur = (ms) => (ms == null ? "still down" : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`);
  return (
    <>
      <p className="note">Each time this page loses its link to the controller, it is logged here. The log is kept in this browser only. {list.length ? `${recent} in the last 24 hours.` : "None recorded yet."}</p>
      {list.length > 0 && (
        <>
          <table className="grid-table">
            <thead><tr><th>When</th><th>Lasted</th><th>Reason</th></tr></thead>
            <tbody>{list.slice(0, 15).map((d, i) => (
              <tr key={i}><th>{new Date(d.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}</th><td>{dur(d.ms)}</td><td>{d.reason}{d.background ? " (tab in background)" : ""}</td></tr>
            ))}</tbody>
          </table>
          <div className="btnrow"><button onClick={clearDrops}>Clear log</button></div>
        </>
      )}
    </>
  );
}

function Recovery({ state }) {
  const [prefs, setP] = useState(null);
  const { cp } = useCheckpoint(state);
  useEffect(() => { getPrefs().then(setP); }, []);
  const save = (k, v) => { setP((p) => ({ ...p, [k]: v })); setPrefs({ [k]: v }); };
  return (
    <>
      <label className="check"><input type="checkbox" className="switch" checked={!!prefs?.progress} disabled={!prefs} onChange={(e) => save("progress", e.target.checked)} /> Save job progress</label>
      <p className="note">While a job runs, the controller saves the program name and line number to its memory card about every 10 seconds, only when the line has changed. If power is lost or the job is stopped, you can resume from that line. This is a few kilobytes of writes per save and runs off the motion path, so it does not affect cutting. Turn it off if you prefer no extra writes. Parking a job needs it on.</p>
      {prefs && (
        <div className="rform">
          <label>Spindle spin-up wait when resuming (seconds)<input type="number" min="0" max="120" value={prefs.spinup} onChange={(e) => save("spinup", e.target.value)} /></label>
          <label>Plunge speed when resuming (mm/min)<input type="number" min="10" max="5000" value={prefs.plunge} onChange={(e) => save("plunge", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={!!prefs.pause} onChange={(e) => save("pause", e.target.checked)} /> Pause over the restart point so I can check it</label>
        </div>
      )}
      {cp && cp.file && <p className="note">Last saved: <b>{cp.file}</b>, line {Number(cp.line).toLocaleString()}, {new Date(cp.t * 1000).toLocaleString()} ({cp.status}){isInterrupted(cp) ? " - interrupted" : ""}.</p>}
    </>
  );
}
