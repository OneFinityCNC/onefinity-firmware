// Per-file notes. Kept in this browser and synced to the controller so every device sees them.
import { useEffect, useState } from "react";
import { remoteGet, remotePut, debounce } from "./store.js";

const KEY = "next-notes";
const subs = new Set();
let map = (() => { try { const m = JSON.parse(localStorage.getItem(KEY) || "{}"); return m && typeof m === "object" ? m : {}; } catch { return {}; } })();
// Notes written before sync existed were stored one key per file.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith("next-note:")) { const f = k.slice(10); if (!map[f]) map[f] = { t: localStorage.getItem(k) || "", at: Date.now() }; localStorage.removeItem(k); }
  }
  localStorage.setItem(KEY, JSON.stringify(map));
} catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {} subs.forEach((f) => f()); };

export function mergeNotes(a, b) {
  const out = { ...a };
  for (const [f, n] of Object.entries(b || {})) if (!out[f] || (n.at || 0) > (out[f].at || 0)) out[f] = n;
  return out;
}
let syncing = false, again = false;
export async function syncNotes() {
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const remote = await remoteGet("notes");
    const merged = mergeNotes(map, remote && typeof remote === "object" ? remote : {});
    const changed = JSON.stringify(merged) !== JSON.stringify(map);
    map = merged; if (changed) save();
    if (!remote || JSON.stringify(remote) !== JSON.stringify(merged)) await remotePut("notes", merged);
  } finally { syncing = false; if (again) { again = false; syncNotes(); } }
}
syncNotes();
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNotes(); });
const later = debounce(syncNotes, 1000);

export const getNote = (f) => map[f]?.t || "";
export const setNote = (f, v) => { map[f] = { t: v, at: Date.now() }; save(); later(); };
export function useNote(file) {
  const [v, setV] = useState(() => getNote(file));
  useEffect(() => { setV(getNote(file)); const f = () => setV(getNote(file)); subs.add(f); return () => subs.delete(f); }, [file]);
  return v;
}
