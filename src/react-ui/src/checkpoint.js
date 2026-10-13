import { useCallback, useEffect, useState } from "react";
import { remoteGet, remotePut } from "./store.js";

const get = () => fetch("/api/next-store/checkpoint", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// An interrupted job is one the controller saved progress for and that did not finish.
export function isInterrupted(cp) {
  if (!cp || !cp.file) return false;
  if (cp.status === "running" || cp.status === "estop" || cp.status === "parked") return true;
  if (cp.status === "stopped") return cp.nlines ? cp.line < cp.nlines - 5 : false;
  return false;
}

export function useCheckpoint(state) {
  const [cp, setCp] = useState(null);
  const refresh = useCallback(() => get().then(setCp), []);
  useEffect(() => { refresh(); }, [refresh, state.xx, state.cycle]);
  useEffect(() => { const f = () => { if (!document.hidden) refresh(); }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [refresh]);
  const dismiss = useCallback(async () => { await remotePut("checkpoint", { action: "dismiss" }); refresh(); }, [refresh]);
  return { cp, refresh, dismiss };
}

export const PREF_DEFAULTS = { progress: true, spinup: 10, plunge: 300, pause: true };
export const getPrefs = () => remoteGet("prefs").then((p) => ({ ...PREF_DEFAULTS, ...(p || {}) }));
export const errText = (e) => { try { return JSON.parse(e.message).message || e.message; } catch { return e.message || String(e); } };
// Prefs are saved as one document, so merge into what is stored.
export const setPrefs = async (p) => remotePut("prefs", { ...(await getPrefs()), ...p });
