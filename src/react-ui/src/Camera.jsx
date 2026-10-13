import React, { useEffect, useRef, useState } from "react";
import { api } from "./controller.js";
import { computeAxis, fmtLen } from "./axis.js";
import { getPrefs, setPrefs, errText } from "./checkpoint.js";
import { debounce } from "./store.js";

// Camera alignment.  The camera sits on the toolhead at a fixed offset from
// the tool.  Once that offset is known, the crosshair can pick points on a
// part; the program is then zeroed on point 1 and rotated to match the part's
// edge.  All points are kept in machine coordinates, so they stay valid after
// the camera is unplugged (as long as the machine stays homed).

const TOOL_NAMES = { router: "Router", laser: "Laser", pwm: "PWM spindle" };
const deg = (r) => (r * 180) / Math.PI;
const norm = (d) => { while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

export function partAngle(p1, p2, edge) {
  if (!p1 || !p2) return null;
  const a = deg(Math.atan2(p2.y - p1.y, p2.x - p1.x));
  return norm(edge === "y" ? a - 90 : a);
}

function useCamPrefs() {
  const [cam, setCam] = useState(null);
  useEffect(() => { getPrefs().then((p) => setCam({ offsets: {}, points: {}, edge: "x", ...(p.camera || {}) })); }, []);
  const update = (fn) => setCam((c) => {
    const n = fn({ ...c });
    setPrefs({ camera: n });
    return n;
  });
  return [cam, update];
}

function Focus({ saved, onSave }) {
  const [st, setSt] = useState(null);
  const [val, setVal] = useState(null);
  const push = useRef(debounce((v) => { api.put("camera", { focus: v }).then(setSt).catch(() => {}); }, 250)).current;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        let s = await api.get("camera");
        if (typeof saved === "number" && s.connected) s = await api.put("camera", { focus: saved });
        if (!dead) { setSt(s); setVal(s.focus); }
      } catch { if (!dead) setSt({ connected: false }); }
    })();
    return () => { dead = true; };
  }, []);

  if (!st || !st.connected || !st.range) return null;
  const locked = typeof saved === "number";
  const lock = (on) => {
    const v = on ? (val ?? st.range.default) : null;
    api.put("camera", { focus: v }).then((s) => { setSt(s); setVal(s.focus); }).catch(() => {});
    onSave(v);
  };
  return (
    <div className="cam-focus">
      <label className="check"><input type="checkbox" checked={locked} onChange={(e) => lock(e.target.checked)} /> Lock focus</label>
      <input type="range" aria-label="Focus" disabled={!locked} min={st.range.min} max={st.range.max} step={st.range.step}
        value={val ?? st.range.default} onChange={(e) => { const v = +e.target.value; setVal(v); push(v); onSave(v); }} />
      <small className="dim">{locked ? `Focus ${val}` : "Autofocus"}</small>
    </div>
  );
}

export default function Camera({ state, cfg, idle }) {
  const [cross, setCross] = useState(true);
  const [broken, setBroken] = useState(false);
  const [cam, update] = useCamPrefs();
  const [calib, setCalib] = useState(null);      // null | {step: 1} | {step: 2, t0}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const imgRef = useRef(null);

  const config = cfg.config;
  const metric = !config || (config.settings?.units || "METRIC") === "METRIC";
  const len = (mm) => `${fmtLen(mm, metric, 2)} ${metric ? "mm" : "in"}`;
  const tool = config?.tool?.["selected-tool"] || "default";
  const toolName = config?.tool?.["tool-type"] || TOOL_NAMES[tool] || tool;
  const homed = !!config && ["x", "y"].every((a) => computeAxis(state, config, a, metric).homed);
  const here = () => ({ x: state.xp || 0, y: state.yp || 0 });
  const off = cam?.offsets?.[tool];
  const pts = cam?.points || {};
  const canPick = idle && homed;
  const angle = partAngle(pts.p1, pts.p2, cam?.edge);
  const span = pts.p1 && pts.p2 ? Math.hypot(pts.p2.x - pts.p1.x, pts.p2.y - pts.p1.y) : 0;
  const file = state.selected;

  const snap = () => {
    const im = imgRef.current; if (!im || !im.naturalWidth) return;
    const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    cv.getContext("2d").drawImage(im, 0, 0);
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a"), t = new Date(), p = (n) => String(n).padStart(2, "0");
      a.href = URL.createObjectURL(b); a.download = `snapshot-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.png`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };

  // The point under the crosshair = where the tool is + camera offset.
  const capture = (k) => {
    const h = here();
    update((c) => ({ ...c, points: { ...c.points, [k]: { x: h.x + off.x, y: h.y + off.y } } }));
    setDone(""); setErr("");
  };

  const finishCalib = () => {
    const h = here(), t0 = calib.t0;
    const o = { x: t0.x - h.x, y: t0.y - h.y };
    if (Math.hypot(o.x, o.y) > 300) { setErr(`That offset is ${len(Math.hypot(o.x, o.y))}, which is more than the camera can be from the tool. Start again.`); setCalib(null); return; }
    update((c) => ({ ...c, offsets: { ...c.offsets, [tool]: o } }));
    setCalib(null); setErr("");
  };

  const setZero = async () => {
    setErr(""); setBusy(true);
    try {
      const h = here();
      await api.put("position/x", { position: h.x - pts.p1.x });
      await api.put("position/y", { position: h.y - pts.p1.y });
      setDone("X/Y zero is set on point 1.");
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const makeCopy = async () => {
    setErr(""); setBusy(true);
    try {
      const info = await api.put("next-align", { file, angle });
      await fetch(`/api/file/${encodeURIComponent(info.file)}`);
      setDone(`Loaded ${info.file}, rotated ${angle.toFixed(2)}°.`);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const P = ({ p }) => p ? <span className="num">X {len(p.x)} · Y {len(p.y)}</span> : <span className="dim">not captured</span>;

  return (
    <div className="camera">
      <div className="files-head">
        <button onClick={() => setCross((c) => !c)}>{cross ? "Hide crosshair" : "Show crosshair"}</button>
        <button onClick={() => setBroken(false)}>Reconnect</button>
        <button disabled={broken} onClick={snap}>Save snapshot</button>
        {cam && !broken && <Focus saved={cam.focus} onSave={(v) => update((c) => ({ ...c, focus: v }))} />}
      </div>
      <div className="cam-layout">
        {broken ? <p className="empty">No camera image. Plug a camera into a USB port on the controller.</p> : (
          <div className="cam"><img ref={imgRef} src="/api/video" alt="Camera view" onError={() => setBroken(true)} />{cross && <div className="cross" />}</div>
        )}

        {cam && (
          <div className="align">
            <h3>Camera offset · {toolName}</h3>
            {!calib && <p>{off ? <>Camera is <span className="num">X {len(off.x)}, Y {len(off.y)}</span> from the {toolName.toLowerCase()}.</> : "Not calibrated for this tool yet."}</p>}
            {!calib && <button disabled={!canPick} onClick={() => { setErr(""); setCalib({ step: 1 }); }}>{off ? "Recalibrate" : "Calibrate"}</button>}
            {calib?.step === 1 && <>
              <p><b>1.</b> Make a small mark with the {toolName.toLowerCase()} (a laser dot, or a light touch with a V-bit) and leave the tool right over it.</p>
              <div className="row-end"><button onClick={() => setCalib(null)}>Cancel</button><button className="primary" disabled={!canPick} onClick={() => setCalib({ step: 2, t0: here() })}>Record tool position</button></div>
            </>}
            {calib?.step === 2 && <>
              <p><b>2.</b> Don't touch the part. Jog only X and Y until the crosshair is exactly on the mark.</p>
              <div className="row-end"><button onClick={() => setCalib(null)}>Cancel</button><button className="primary" disabled={!canPick} onClick={finishCalib}>Record crosshair position</button></div>
            </>}

            <h3>Align the program to the part</h3>
            {!off && <p className="dim">Calibrate the camera offset first.</p>}
            {off && <>
              <p><b>Point 1</b> — put the crosshair on the part's reference point, the spot that is X0 Y0 in your program.<br /><P p={pts.p1} /></p>
              <button disabled={!canPick} onClick={() => capture("p1")}>Capture point 1</button>

              <p><b>Point 2</b> — a second point along the part's
                <select aria-label="Edge" value={cam.edge} onChange={(e) => update((c) => ({ ...c, edge: e.target.value }))}>
                  <option value="x">X edge</option><option value="y">Y edge</option>
                </select>
                in the program's + direction, as far from point 1 as you can.<br /><P p={pts.p2} /></p>
              <button disabled={!canPick || !pts.p1} onClick={() => capture("p2")}>Capture point 2</button>

              {angle !== null && <p>Part is turned <b className="num">{angle.toFixed(2)}°</b> over {len(span)}.
                {span < 20 && <span className="err"> Points are close together, so the angle is rough. Spread them further apart.</span>}
                {Math.abs(angle) > 10 && <span className="err"> That's a lot. Check point 2 is along the {cam.edge.toUpperCase()} edge in the + direction.</span>}</p>}

              <div className="row-end">
                <button disabled={!canPick || !pts.p1 || busy} onClick={setZero}>Set X/Y zero on point 1</button>
                <button className="primary" disabled={!idle || !file || angle === null || Math.abs(angle) < 0.01 || busy} onClick={makeCopy}>
                  {file ? `Make rotated copy of ${file}` : "Load a program first"}
                </button>
              </div>
              {angle !== null && Math.abs(angle) < 0.01 && <p className="dim">The part is square. No rotated copy needed, run the original.</p>}
            </>}
            {!homed && <p className="err">Home the machine first. Positions are only repeatable after homing.</p>}
            {err && <p className="err">{err}</p>}
            {done && <div className="why"><b>{done}</b><p>Probe Z as usual. You can take the camera off now; the points stay valid while the machine stays homed.</p></div>}
          </div>
        )}
      </div>
    </div>
  );
}
