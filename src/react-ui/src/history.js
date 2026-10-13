// Run history, kept in this browser. A run starts when a program starts and ends when the machine goes idle or E-stops.
import { useEffect, useRef, useState } from "react";

import { remoteGet, remotePut } from "./store.js";

const KEY = "next-runs";
const subs = new Set();
const MAX = 200;
// Stored as { clearedAt, runs }. Runs are merged by start time and file across browsers; clearedAt lets "Clear history" reach every device.
const norm = (d) => (Array.isArray(d) ? { clearedAt: 0, runs: d } : { clearedAt: d?.clearedAt || 0, runs: Array.isArray(d?.runs) ? d.runs : [] });
export function mergeRuns(a, b) {
  a = norm(a); b = norm(b);
  const clearedAt = Math.max(a.clearedAt, b.clearedAt);
  const seen = new Map();
  for (const r of [...a.runs, ...b.runs]) if (r.at > clearedAt) seen.set(`${r.at}|${r.file}`, r);
  return { clearedAt, runs: [...seen.values()].sort((x, y) => y.at - x.at).slice(0, MAX) };
}
let data = (() => { try { return norm(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return norm(null); } })();
let list = data.runs;
const save = () => { list = data.runs; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} subs.forEach((f) => f()); };

let syncing = false, again = false;
export async function syncRuns() {
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const remote = await remoteGet("runs");
    const merged = mergeRuns(data, remote);
    const changedLocal = JSON.stringify(merged) !== JSON.stringify(data);
    data = merged; if (changedLocal) save();
    if (!remote || JSON.stringify(norm(remote)) !== JSON.stringify(merged)) await remotePut("runs", merged);
  } finally { syncing = false; if (again) { again = false; syncRuns(); } }
}
syncRuns();
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) syncRuns(); });

export const clearRuns = () => { data = { clearedAt: Date.now(), runs: [] }; save(); syncRuns(); };
let stopFlag = false;
export const markStopped = () => { stopFlag = true; };

export function useRuns() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return list;
}

export function useRunTracker(state) {
  const cur = useRef(null);
  const { xx, cycle, selected } = state;
  useEffect(() => {
    const now = Date.now(), c = cur.current;
    if (!c) {
      if (xx === "RUNNING" && cycle === "running") { stopFlag = false; cur.current = { file: selected || "", at: now, hold: 0, holdAt: null, stopping: false }; }
      return;
    }
    if (xx === "HOLDING" && c.holdAt === null) c.holdAt = now;
    if (xx === "RUNNING" && c.holdAt !== null) { c.hold += now - c.holdAt; c.holdAt = null; }
    if (xx === "STOPPING") c.stopping = true;
    if (xx === "READY" || xx === "ESTOPPED") {
      if (c.holdAt !== null) c.hold += now - c.holdAt;
      const ms = now - c.at;
      const status = xx === "ESTOPPED" ? "E-stop" : (stopFlag || c.stopping) ? "Stopped" : "Finished";
      data = { ...data, runs: [{ file: c.file, at: c.at, ms, runMs: Math.max(0, ms - c.hold), status }, ...data.runs].slice(0, MAX) }; save(); syncRuns();
      cur.current = null; stopFlag = false;
    }
  }, [xx, cycle, selected]);
}
