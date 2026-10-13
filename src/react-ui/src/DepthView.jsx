import React, { useEffect, useMemo, useRef, useState } from "react";
import { makeGrid, makeTool, run } from "./sim.js";
import { readSetupHeader } from "./setup.js";

const SNAPSHOTS = 12, FRAME_MS = 40, PLAY_SECONDS = 20;
const STOPS = [[253,231,37],[186,222,40],[122,209,81],[68,191,112],[34,168,132],[32,144,140],[42,120,142],[65,68,135],[68,1,84]];
const LUT = (() => {
  const l = new Uint8ClampedArray(768);
  for (let i = 0; i < 256; i++) {
    const p = (i / 255) * (STOPS.length - 1), k = Math.min(Math.floor(p), STOPS.length - 2), f = p - k;
    for (let c = 0; c < 3; c++) l[i * 3 + c] = STOPS[k][c] + (STOPS[k + 1][c] - STOPS[k][c]) * f;
  }
  return l;
})();

const load = (k, d) => { try { return localStorage.getItem("next-" + k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem("next-" + k, v); } catch {} };

export default function DepthView({ path, busy: pathBusy, file }) {
  const [dia, setDia] = useState(parseFloat(load("dia", "3.175")) || 3.175);
  const [type, setType] = useState(load("type", "flat"));
  const [vAngle, setVAngle] = useState(parseFloat(load("vangle", "60")) || 60);
  const [stockTop, setStockTop] = useState(0);
  // The tool comes from the program's setup sheet (tool-geom line) when it has one. Values typed here
  // are remembered per program file and win over the sheet until "Use setup sheet" is pressed.
  const [ready, setReady] = useState(null);
  const [manual, setManual] = useState(false);
  const [sheetTool, setSheetTool] = useState(null);
  const applyTool = (g) => { setDia(g.dia); setType(g.type); if (g.angle) setVAngle(g.angle); };
  useEffect(() => {
    let cancelled = false;
    setReady(null);
    let v = null; try { v = JSON.parse(localStorage.getItem("next-depth:" + file) || "null"); } catch {}
    (async () => {
      let geom = null;
      if (file) { try { geom = (await readSetupHeader(file))?.toolGeom || null; } catch { /* no sheet */ } }
      if (cancelled) return;
      setSheetTool(geom);
      const own = !!(v && v.manual);
      if (v && (own || !geom)) { setDia(v.dia); setType(v.type); setVAngle(v.vAngle); setStockTop(v.stockTop); }
      else if (v) setStockTop(v.stockTop);
      else setStockTop(0);
      if (geom && !own) applyTool(geom);
      setManual(own);
      setReady(file);
    })();
    return () => { cancelled = true; };
  }, [file]);
  useEffect(() => {
    if (file && ready === file) { try { localStorage.setItem("next-depth:" + file, JSON.stringify({ dia, type, vAngle, stockTop, manual })); } catch {} }
  }, [ready, file, dia, type, vAngle, stockTop, manual]);
  const edit = (set) => (value) => { setManual(true); set(value); };
  const [pos, setPos] = useState(0);
  const [last, setLast] = useState(0);
  const [percent, setPercent] = useState(0);
  const [building, setBuilding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hits, setHits] = useState(0);
  const [zmin, setZmin] = useState(-1);
  const depthRef = useRef(null), markRef = useRef(null);
  const sim = useRef({});

  const draw = (v) => {
    const s = sim.current; if (!s.grid) return;
    if (v !== s.drawn) {
      let snap = s.snaps[0];
      for (const x of s.snaps) if (x.v <= v) snap = x;
      s.h.set(snap.h);
      run(s.grid, s.h, s.tool, path.positions, path.speeds, snap.v, v, s.stockTop);
      s.drawn = v;
    }
    const { grid: g, h } = s, nx = g.nx, ny = g.ny, d = s.image.data;
    for (let i = 0; i < ny; i++) {
      const up = Math.max(i - 1, 0) * nx, dn = Math.min(i + 1, ny - 1) * nx, row = i * nx;
      for (let j = 0; j < nx; j++) {
        const k = row + j;
        const light = 1 + 0.08 * (h[row + Math.max(j - 1, 0)] - h[row + Math.min(j + 1, nx - 1)] + h[dn + j] - h[up + j]);
        const sh = Math.min(Math.max(light, 0.7), 1.25);
        let t = h[k] / s.zmin; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const c = Math.round(t * 255) * 3, o = k * 4;
        d[o] = LUT[c] * sh; d[o + 1] = LUT[c + 1] * sh; d[o + 2] = LUT[c + 2] * sh; d[o + 3] = 255;
      }
    }
    depthRef.current.getContext("2d").putImageData(s.image, 0, 0);
    const m = markRef.current, ctx = m.getContext("2d");
    ctx.clearRect(0, 0, m.width, m.height);
    const p = path.positions;
    ctx.lineWidth = Math.max(2, m.width / 250);
    ctx.strokeStyle = "#fff";
    ctx.beginPath(); ctx.arc((p[v * 3] - g.x0) / g.res, (g.y1 - p[v * 3 + 1]) / g.res, s.tool.radius / g.res, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth /= 2.5; ctx.strokeStyle = "#111"; ctx.stroke();
  };

  // Rebuild the height map whenever the path or tool changes.
  useEffect(() => {
    save("dia", dia); save("type", type); save("vangle", vAngle);
    setPlaying(false);
    const s = sim.current = { token: Symbol() };
    const token = s.token;
    if (ready !== file) return; // wait until this file's tool settings are loaded
    if (!path || !path.positions || path.positions.length < 6 || !(dia > 0)) { setLast(0); return; }
    const radius = dia / 2, n = path.positions.length / 3;
    s.tool = makeTool(radius, type === "v" ? vAngle : 0);
    s.grid = makeGrid(path.bounds, radius);
    s.h = new Float32Array(s.grid.nx * s.grid.ny);
    s.snaps = [{ v: 0, h: new Float32Array(s.h) }];
    s.stockTop = stockTop;
    s.zmin = Math.min((path.bounds.min.z || 0) - stockTop, -0.1);
    s.drawn = -1;
    setZmin(s.zmin); setLast(n - 1); setBuilding(true); setPercent(0);
    for (const r of [depthRef, markRef]) { r.current.width = s.grid.nx; r.current.height = s.grid.ny; }
    s.image = depthRef.current.getContext("2d").createImageData(s.grid.nx, s.grid.ny);
    const step = Math.ceil(n / SNAPSHOTS);
    let v = 0, next = step, rapid = 0;
    const slice = () => {
      if (token !== sim.current.token) return;
      const t0 = Date.now();
      while (v < n - 1 && Date.now() - t0 < FRAME_MS) {
        const to = Math.min(v + 2000, n - 1, next);
        rapid += run(s.grid, s.h, s.tool, path.positions, path.speeds, v, to, stockTop);
        v = to;
        if (v === next) { s.snaps.push({ v, h: new Float32Array(s.h) }); next += step; }
      }
      setPercent(Math.round((v / (n - 1)) * 100));
      if (v < n - 1) setTimeout(slice, 0);
      else { s.drawn = n - 1; setHits(rapid); setBuilding(false); setPos(n - 1); draw(n - 1); }
    };
    setTimeout(slice, 0);
    return () => { sim.current.token = null; };
    // eslint-disable-next-line
  }, [path, dia, type, vAngle, stockTop, ready]);

  useEffect(() => {
    if (!playing) return;
    let raf, prev = performance.now(), cur = pos >= last ? 0 : pos;
    const perMs = last / (PLAY_SECONDS * 1000);
    const tick = (now) => {
      cur = Math.min(last, cur + Math.max(1, Math.round((now - prev) * perMs))); prev = now;
      setPos(cur); draw(cur);
      if (cur >= last) setPlaying(false); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [playing]);

  const readout = useMemo(() => {
    if (!path || !last) return "";
    const v = Math.min(pos, last) * 3, p = path.positions;
    return `X ${p[v].toFixed(1)}  Y ${p[v + 1].toFixed(1)}  Z ${(p[v + 2] - stockTop).toFixed(2)}`;
  }, [path, pos, last, stockTop]);

  return (
    <div className="depth">
      <div className="depth-tools">
        <label>Tool diameter<input type="number" step="0.001" min="0.1" value={dia} onChange={(e) => edit(setDia)(parseFloat(e.target.value) || 0)} /><em>mm</em></label>
        <label>Shape
          <select value={type} onChange={(e) => edit(setType)(e.target.value)}><option value="flat">Flat end mill</option><option value="v">V-bit</option></select>
        </label>
        {type === "v" && <label>Angle<input type="number" min="10" max="150" value={vAngle} onChange={(e) => edit(setVAngle)(parseFloat(e.target.value) || 60)} /><em>°</em></label>}
        <label>Stock top at Z<input type="number" step="0.1" value={stockTop} onChange={(e) => edit(setStockTop)(parseFloat(e.target.value) || 0)} /><em>mm</em></label>
        {sheetTool && !manual && <span className="depth-src">Tool from setup sheet</span>}
        {sheetTool && manual && <button className="depth-src" onClick={() => { applyTool(sheetTool); setManual(false); }}>Use setup sheet tool</button>}
        {!sheetTool && ready === file && file && <span className="depth-src muted">No tool in this program's setup sheet. Set it here.</span>}
      </div>

      <div className="stage">
        {!path && <p className="empty">{pathBusy ? "Planning the tool path…" : "Select a program in Files to preview what it cuts."}</p>}
        <div className="canvases" style={{ visibility: path ? "visible" : "hidden" }}>
          <canvas ref={depthRef} /><canvas ref={markRef} className="marker" />
        </div>
        {path && building && <div className="building">Simulating {percent}%</div>}
        {path && <div className="legend" aria-label="Depth scale"><span>0</span><i /><span>{zmin.toFixed(1)} mm</span></div>}
      </div>

      <div className="scrub">
        <button disabled={building || !path} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
        <input type="range" min="0" max={last} value={pos} disabled={building || !path} aria-label="Program position"
          onChange={(e) => { setPlaying(false); const v = +e.target.value; setPos(v); draw(v); }} />
        <span className="read">{readout}</span>
      </div>
      {hits > 0 && <p className="warn-line">{hits} rapid move{hits > 1 ? "s" : ""} pass below the stock surface. Check the program before you run it.</p>}
    </div>
  );
}
