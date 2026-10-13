import React, { useEffect, useRef } from "react";

// Top-down view of the tool path, shaded by cutting depth, with the live tool position.
export default function PathView({ path, busy, state }) {
  const ref = useRef(null);
  const geo = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const box = c.parentElement.getBoundingClientRect();
    const W = (c.width = Math.max(300, Math.floor(box.width * devicePixelRatio)));
    const H = (c.height = Math.max(200, Math.floor(box.height * devicePixelRatio)));
    const live = document.getElementById("path-live");
    if (live) { live.width = W; live.height = H; }
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    geo.current = null;
    if (!path?.positions?.length) return;
    const b = path.bounds, pad = 24 * devicePixelRatio;
    const w = Math.max(b.max.x - b.min.x, 1), h = Math.max(b.max.y - b.min.y, 1);
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    const ox = (W - w * s) / 2 - b.min.x * s, oy = (H + h * s) / 2 + b.min.y * s;
    geo.current = { s, ox, oy };
    const P = path.positions, S = path.speeds, n = P.length / 3;
    const zmin = Math.min(b.min.z, -0.1);
    ctx.lineJoin = "round";
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const rapid = isNaN(S[i]);
        if ((pass === 0) !== rapid) continue;
        const z = P[i * 3 + 2];
        ctx.beginPath();
        ctx.moveTo(P[(i - 1) * 3] * s + ox, oy - P[(i - 1) * 3 + 1] * s);
        ctx.lineTo(P[i * 3] * s + ox, oy - P[i * 3 + 1] * s);
        if (rapid) { ctx.strokeStyle = "rgba(138,151,166,.35)"; ctx.lineWidth = 1; }
        else { const t = Math.min(1, Math.max(0, z / zmin)); ctx.strokeStyle = `hsl(${210 - t * 170},80%,${62 - t * 8}%)`; ctx.lineWidth = Math.max(1.5, devicePixelRatio * 1.5); }
        ctx.stroke();
      }
    }
  }, [path]);

  useEffect(() => {
    const c = document.getElementById("path-live"); if (!c || !geo.current) return;
    const ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height);
    const { s, ox, oy } = geo.current;
    const x = ((state.xp || 0) - (state.offset_x || 0)) * s + ox, y = oy - ((state.yp || 0) - (state.offset_y || 0)) * s;
    ctx.strokeStyle = "#f5c518"; ctx.lineWidth = 2 * devicePixelRatio;
    ctx.beginPath(); ctx.arc(x, y, 7 * devicePixelRatio, 0, 7); ctx.moveTo(x - 12 * devicePixelRatio, y); ctx.lineTo(x + 12 * devicePixelRatio, y); ctx.moveTo(x, y - 12 * devicePixelRatio); ctx.lineTo(x, y + 12 * devicePixelRatio); ctx.stroke();
  }, [state.xp, state.yp, state.offset_x, state.offset_y, path]);

  return (
    <div className="stage">
      {!path && <p className="empty">{busy ? "Planning the tool path…" : "Select a program in Files to see its tool path."}</p>}
      <div className="canvases" style={{ visibility: path ? "visible" : "hidden", inset: 8 }}>
        <canvas ref={ref} className="smooth" /><canvas id="path-live" className="smooth marker" />
      </div>
    </div>
  );
}
