// Connection drop log: every time the live link to the controller is lost, kept in this browser.
import { useEffect, useState } from "react";

const KEY = "next-drops";
const subs = new Set();
let pending = null; // drop in progress
let list = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } })();

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch {} subs.forEach((f) => f()); };

export function recordDown(reason) {
  if (pending) return;
  pending = { at: Date.now(), ms: null, reason, background: typeof document !== "undefined" && document.hidden };
  list = [pending, ...list]; save();
}
export function recordUp() {
  if (!pending) return;
  pending.ms = Date.now() - pending.at; pending = null; save();
}
export function clearDrops() { list = pending ? [pending] : []; save(); }

export function useDrops() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return list;
}
