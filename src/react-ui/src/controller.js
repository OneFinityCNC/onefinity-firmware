import { useEffect, useRef, useState, useCallback } from "react";

async function call(method, url, body) {
  const opts = { method, cache: "no-cache", headers: {} };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof FormData) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json; charset=utf-8"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(`/api/${url}`, opts);
  if (!r.ok) throw new Error(await r.text());
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}
export const api = {
  get: (u) => call("GET", u),
  put: (u, b) => call("PUT", u, b),
  del: (u) => call("DELETE", u),
};

export const MACRO_PREFIX = "EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE";
export const DELETE_LIST_PREFIX = "DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH";

export async function loadPath(file) {
  // The planner answers {progress} until the path is ready.
  for (;;) {
    const info = await api.get(`path/${encodeURIComponent(file)}`);
    if (info.progress === undefined || info.progress === 1) {
      const [p, s] = await Promise.all(
        ["positions", "speeds"].map((k) =>
          fetch(`/api/path/${encodeURIComponent(file)}/${k}`).then((r) => r.arrayBuffer())
        )
      );
      return { bounds: info.bounds, time: info.time, lines: info.lines, positions: new Float32Array(p), speeds: new Float32Array(s) };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

import { recordDown, recordUp } from "./drops.js";

// Live machine state over the controller's raw websocket.
export function useController() {
  const [state, setState] = useState({});
  const [online, setOnline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastError, setLastError] = useState(null);
  const ws = useRef(null);
  const listeners = useRef(new Set());

  useEffect(() => {
    let closed = false, timer, lastMsg = Date.now(), everUp = false;
    // The controller sends a heartbeat every 3 s. Silence for 8 s means the link is dead even if the
    // socket still looks open (a common Wi-Fi failure). Close it so it reconnects and the drop is logged.
    const watch = setInterval(() => {
      const s = ws.current;
      if (!s || s.readyState !== 1 || document.hidden) return;
      const quiet = Date.now() - lastMsg;
      if (quiet > 8000) { recordDown(`No data for ${Math.round(quiet / 1000)} s`); setOnline(false); s.close(); }
    }, 2000);
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const s = new WebSocket(`${proto}://${location.host}/websocket`);
      ws.current = s;
      s.onopen = () => { lastMsg = Date.now(); everUp = true; recordUp(); setOnline(true); };
      s.onmessage = (e) => {
        lastMsg = Date.now();
        let d; try { d = JSON.parse(e.data); } catch { return; }
        setOnline(true);
        delete d.heartbeat;
        if (!Object.keys(d).length) return;
        listeners.current.forEach((f) => f(d));
        if (d.log) {
          const m = { ...d.log, level: d.log.level || "info", id: Math.random() };
          setLogs((l) => {
            if (l.length && l[0].msg === m.msg && l[0].level === m.level) return [{ ...l[0], repeat: (l[0].repeat || 1) + 1 }, ...l.slice(1)];
            return [m, ...l].slice(0, 256);
          });
          if (m.level === "error" || m.level === "critical") setLastError({ ...m, at: Date.now() });
        }
        setState((prev) => {
          if (d.sid && prev.sid && d.sid !== prev.sid) location.reload();
          return { ...prev, ...d };
        });
      };
      s.onclose = () => { setOnline(false); if (!closed && everUp) recordDown("Connection closed"); if (!closed) timer = setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); clearInterval(watch); ws.current && ws.current.close(); };
  }, []);

  const send = useCallback((gcode) => {
    if (ws.current && ws.current.readyState === 1) ws.current.send(gcode);
  }, []);
  const subscribe = useCallback((fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); }, []);
  return { state, online, send, subscribe, logs, clearLogs: () => setLogs([]), lastError, clearError: () => setLastError(null) };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function fixVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-.]?(.*))?$/.exec((v || "").trim());
  if (!m) return v || "";
  let out = `${m[1]}.${m[2]}.${m[3]}`;
  if (m[4]) {
    const b = /([a-zA-Z])(\d+)/.exec(m[4]);
    out += b && b[1] === "b" ? `-beta.${b[2]}` : `-${m[4]}`;
  }
  return out;
}

// Configuration: the saved copy from the controller plus the operator's unsaved edits.
export function useConfig(state) {
  const [draft, setDraft] = useState(null);
  const [template, setTemplate] = useState(null);
  const [net, setNet] = useState({});
  const [modified, setModified] = useState(false);
  const modRef = useRef(false);
  modRef.current = modified;

  const reload = useCallback(async (force) => {
    const c = await api.get("config/load");
    c.full_version = fixVersion(c.full_version);
    if (force || !modRef.current) { setDraft(c); setModified(false); }
    api.get("wifi").then((w) => setNet({ ip: w.ipAddresses, wifi: w.wifi })).catch(() => {});
    return c;
  }, []);

  useEffect(() => {
    reload(true).catch(() => {});
    fetch("/config-template.json", { cache: "no-cache" }).then((r) => r.json()).then(setTemplate).catch(() => {});
  }, [reload]);

  const edit = useCallback((fn) => {
    setDraft((d) => { if (!d) return d; const c = clone(d); fn(c); return c; });
    setModified(true);
  }, []);

  const patch = useCallback((fn) => {
    setDraft((d) => { if (!d) return d; const c = clone(d); fn(c); return JSON.stringify(c) === JSON.stringify(d) ? d : c; });
  }, []);

  const save = useCallback(async (extra) => {
    const c = clone(draft);
    for (const k of ["macros", "macros_list", "non_macros_list", "gcode_list"]) if (state[k]) c[k] = clone(state[k]);
    if (extra) extra(c);
    const sel = c.tool && c.tool["selected-tool"];
    if (sel) {
      const saveModbus = sel !== "pwm" && sel !== "laser" && sel !== "router";
      const tool = { ...c.tool }; delete tool["tool-type"];
      c["selected-tool-settings"] = c["selected-tool-settings"] || {};
      c["selected-tool-settings"][sel] = { tool, "pwm-spindle": { ...c["pwm-spindle"] }, "modbus-spindle": saveModbus ? { ...c["modbus-spindle"] } : undefined };
    }
    await api.put("config/save", c);
    setModified(false);
    await reload(true);
  }, [draft, state, reload]);

  return { config: draft, template, net, modified, edit, patch, save, reload, discard: () => reload(true) };
}

export const metricOf = (config) => !config || (config.settings?.units || "METRIC") === "METRIC";
