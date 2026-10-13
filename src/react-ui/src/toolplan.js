import { useEffect, useState } from "react";

// Reads the selected program and finds its tool changes (an M6, with the T word before or on it).
export function parseToolChanges(lines) {
  const out = [];
  let pending = null;
  lines.forEach((raw, i) => {
    const l = raw.replace(/\([^)]*\)/g, "").replace(/;.*$/, "");
    const t = /(?:^|[^A-Za-z])T\s*(\d+)/i.exec(l);
    if (t) pending = Number(t[1]);
    if (/(?:^|[^A-Za-z])M0*6(?!\d)/i.test(l) && pending !== null) out.push({ line: i + 1, tool: pending });
  });
  return out;
}

export function useProgram(state) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!state.selected) { setLines([]); return; }
    let dead = false;
    fetch(`/api/file/${encodeURIComponent(state.selected)}`, { cache: "no-cache" })
      .then((r) => r.text()).then((t) => !dead && setLines(t.split("\n"))).catch(() => !dead && setLines([]));
    return () => { dead = true; };
  }, [state.selected, state.selected_time]);
  return lines;
}
