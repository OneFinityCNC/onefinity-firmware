import React, { useEffect, useState } from "react";
import { api } from "./controller.js";
import { Field, Page, Group, SubTabs, Modal } from "./ui.jsx";
import { Io } from "./io.jsx";
import { status_to_string } from "./modbus.js";
import { VfdNotes, VfdProgram } from "./VfdRegs.jsx";

const get = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => { let t = o; for (const k of p.slice(0, -1)) t = t[k]; t[p[p.length - 1]] = v; };

// A setting bound to a path in the config draft.
export function Bound({ cfg, path, tpl, metric, extra, name, id, disabled }) {
  const value = get(cfg.config, path);
  if (!tpl) return null;
  return <Field id={id || path.join(".")} name={name || path[path.length - 1]} tpl={tpl} value={value} metric={metric} extra={extra} disabled={disabled}
    onChange={(v) => cfg.edit((c) => set(c, path, v))} />;
}

const Loading = ({ title }) => <Page title={title}><p className="empty">Loading settings from the controller…</p></Page>;

/* ---------------------------------------------------------------- Settings */
export function Settings({ cfg, metric }) {
  const t = cfg.template, [rot, setRot] = useState(null), [rotBusy, setRotBusy] = useState(false), [rotNew, setRotNew] = useState(0);
  useEffect(() => { api.get("screen-rotation").then((r) => { const v = r.rotated ? 1 : 0; setRot(v); setRotNew(v); }).catch(() => {}); }, []);
  if (!cfg.config || !t) return <Loading title="Settings" />;
  const B = (path, extra = {}) => <Bound cfg={cfg} path={path} tpl={get(t, path)} metric={metric} {...extra} />;
  return (
    <Page title="Settings">
      <div className="cols">
        <div>
          <Group title="Units" note="Units set both the machine's default units and the units shown in motor settings. The G-code program-start setting below can also change the machine's default units.">{B(["settings", "units"])}</Group>
          <Group title="Screen">
            <div className="field"><label>Screen rotation</label>
              <div className="ctl"><select value={rotNew} onChange={(e) => setRotNew(Number(e.target.value))} disabled={rot === null}><option value={0}>Normal</option><option value={1}>Upside-down</option></select>
                <button disabled={rot === null || rotNew === rot || rotBusy} onClick={async () => { setRotBusy(true); try { await api.put("screen-rotation", { rotated: rotNew === 1 }); } catch {} }}>Apply and reboot</button></div>
              {rotBusy && <p className="hint">Rebooting to apply the new screen rotation…</p>}</div>
          </Group>
          <Group title="Easy Adapter">{B(["settings", "easy-adapter"])}</Group>
          <Group title="Path accuracy" note="Lower the maximum deviation to follow the programmed path more precisely, at a slower speed. To go faster the planner may merge consecutive moves or round off sharp corners when that changes the path by less than this amount. G61, G61.1 and G64 in your G-code also affect path accuracy.">{B(["settings", "max-deviation"])}</Group>
          <Group title="Cornering speed (advanced)" note="Junction acceleration limits how fast the planner will take corners. Raising it allows faster corners but can push the axes past their jerk limits and stall the motors. Use with caution.">{B(["settings", "junction-accel"])}</Group>
        </div>
        <div>
          <Group title="Probing" note="Onefinity recommends keeping the safety prompts on. If you turn them off, Onefinity cannot be held responsible.">
            {B(["settings", "probing-prompts"])}
            <h3>Probe block</h3>
            {Object.keys(t.probe).filter((k) => k !== "probe-diameter").map((k) => <React.Fragment key={k}>{B(["probe", k])}</React.Fragment>)}
            <h3>Probe block for rotary</h3>
            {Object.keys(t["probe-rotary"]).filter((k) => k !== "probe-diameter").map((k) => <React.Fragment key={k}>{B(["probe-rotary", k])}</React.Fragment>)}
          </Group>
          <Group title="G-code">{Object.keys(t.gcode).map((k) => <React.Fragment key={k}>{B(["gcode", k])}</React.Fragment>)}</Group>
        </div>
      </div>
    </Page>
  );
}

/* --------------------------------------------------------------------- I/O */
export function IO({ cfg, state, metric }) {
  const t = cfg.template;
  if (!cfg.config || !t) return <Loading title="I/O" />;
  const row = (sect, k) => <Bound key={k} cfg={cfg} path={[sect, k]} tpl={t[sect][k]} metric={metric}
    extra={t[sect][k].pin ? <span className="pin">Pin {t[sect][k].pin} <Io name={k} state={state} /></span> : null} />;
  return (
    <Page title="I/O">
      <div className="cols">
        <Group title="Switches">{Object.keys(t.switches).map((k) => row("switches", k))}</Group>
        <Group title="Outputs">{Object.keys(t.outputs).map((k) => row("outputs", k))}</Group>
      </div>
    </Page>
  );
}

/* -------------------------------------------------------------------- Tool */
const TOOLS = [
  { id: "disabled", name: "Disabled" },
  { id: "router", type: "PWM Spindle", name: "Router (Makita, etc)" },
  { id: "laser", type: "PWM Spindle", name: "Laser (J Tech, etc)" },
  { id: "redline-vfd", name: "Redline VFD" },
];
const UNSUPPORTED = [
  { id: "em60", name: "EM60" }, { id: "pwm", name: "PWM Spindle" }, { id: "huanyang-vfd", name: "Huanyang VFD" },
  { id: "custom-modbus-vfd", name: "Custom Modbus VFD" }, { id: "ac-tech-vfd", name: "AC-Tech VFD" }, { id: "nowforever-vfd", name: "Nowforever VFD" },
  { id: "delta-vfd", name: "Delta VFD015M21A (Beta)" }, { id: "yl600-vfd", name: "YL600, YL620, YL620-A VFD (Beta)" }, { id: "fr-d700-vfd", name: "FR-D700 (Beta)" },
  { id: "sunfar-e300-vfd", name: "Sunfar E300 (Beta)" }, { id: "omron-mx2-vfd", name: "OMRON MX2" }, { id: "v70-vfd", name: "V70" },
];
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v; return o; };

export function Tool({ cfg, state, metric, send }) {
  const t = cfg.template;
  if (!cfg.config || !t) return <Loading title="Tool" />;
  const c = cfg.config, sel = c.tool["selected-tool"];
  const all = [...TOOLS, ...UNSUPPORTED];
  const isPwm = sel === "pwm";
  const isModbus = !["disabled", "laser", "router", "pwm"].includes(sel);
  const toolType = (c.tool["tool-type"] || "").toUpperCase();
  const isCustom = toolType === "CUSTOM MODBUS VFD";
  const show = (k) => {
    if (k === "tool-type" || k === "selected-tool" || sel === "disabled") return false;
    if (sel === "laser" || sel === "router") return k === "tool-enable-mode";
    return true;
  };
  const change = (id) => cfg.edit((x) => {
    x.tool["selected-tool"] = id;
    const saved = (x["selected-tool-settings"] || {})[id] || {};
    x.tool = merge(x.tool, saved.tool); x["pwm-spindle"] = merge(x["pwm-spindle"], saved["pwm-spindle"]); x["modbus-spindle"] = merge(x["modbus-spindle"], saved["modbus-spindle"]);
    const tl = all.find((z) => z.id === id);
    x.tool["tool-type"] = tl.type || tl.name;
    x.tool["selected-tool"] = id;
  });
  return (
    <Page title="Tool">
      <div className="cols">
        <div>
          <Group title="Spindle or tool">
            <div className="field"><label htmlFor="tool-sel">Tool type</label>
              <div className="ctl"><select id="tool-sel" value={sel} onChange={(e) => change(e.target.value)}>
                {TOOLS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <optgroup label="Unsupported tools">{UNSUPPORTED.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
              </select></div></div>
            {Object.keys(t.tool).filter(show).map((k) => (
              <Bound key={k} cfg={cfg} path={["tool", k]} tpl={t.tool[k]} metric={metric}
                extra={(k === "tool-enable-mode" || k === "tool-direction-mode") ? <span className="pin">Pin {t.tool[k].pin} <Io name={k} state={state} /></span> : null} />
            ))}
          </Group>
          {isPwm && <Group title="PWM spindle">{Object.keys(t["pwm-spindle"]).map((k) => <Bound key={k} cfg={cfg} path={["pwm-spindle", k]} tpl={t["pwm-spindle"][k]} metric={metric} />)}</Group>}
        </div>
        <div>
          {isModbus && (
            <Group title="Modbus">
              {Object.keys(t["modbus-spindle"]).filter((k) => k !== "regs" && (k !== "multi-write" || isCustom)).map((k) => <Bound key={k} cfg={cfg} path={["modbus-spindle", k]} tpl={t["modbus-spindle"][k]} metric={metric} />)}
              <h3>VFD status</h3>
              <dl className="stats one"><div className="stat"><dt>Connection</dt><dd>{status_to_string(state.mx)}</dd></div><div className="stat"><dt>Status</dt><dd>{state.ss || 0}</dd></div><div className="stat"><dt>Speed</dt><dd>{Math.round(state.s || 0)} rpm</dd></div></dl>
            </Group>
          )}
          {isModbus && !["HUANYANG VFD", "REDLINE VFD", "EM60"].includes(toolType) && <VfdProgram cfg={cfg} state={state} send={send} template={t} toolType={toolType} />}
          {isModbus && <VfdNotes toolType={toolType} />}
          {!isModbus && !isPwm && sel !== "disabled" && <Group title="Tool"><p className="dim">A {sel === "laser" ? "laser" : "router"} is switched on and off through the tool enable output. Set its speed in your G-code with S words.</p></Group>}
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ Motors */
const AX = ["X", "Y", "Z", "A", "B", "C"];
const MAP = { an: "axis", vm: "max-velocity", tm: "max-soft-limit", tn: "min-soft-limit", am: "max-accel", jm: "max-jerk", sa: "step-angle", tr: "travel-per-rev", mi: "microsteps" };

export function Motors({ cfg, state, metric, index, go }) {
  const t = cfg.template;
  const c = cfg.config;
  useEffect(() => {
    if (!c) return;
    cfg.patch((x) => {
      x.motors.forEach((m, i) => {
        for (const [suffix, key] of Object.entries(MAP)) {
          const sv = state[`${i}${suffix}`];
          if (sv === undefined) continue;
          const v = suffix === "an" ? AX[sv] : sv;
          if (v !== undefined && m[key] !== v) m[key] = v;
        }
      });
    });
    // eslint-disable-next-line
  }, [!!c, index, ...Object.keys(MAP).map((s) => state[`${index}${s}`])]);
  if (!c || !t) return <Loading title="Motors" />;
  const m = c.motors[index];
  if (!m) return <Page title="Motors"><p className="empty">There is no motor {index}.</p></Page>;
  const tmpl = t.motors.template;

  const umPerStep = (m["travel-per-rev"] * m["step-angle"]) / 0.36;
  const stepsPerRev = 360 / m["step-angle"];
  const rpm = (1000 * m["max-velocity"]) / m["travel-per-rev"];
  const ustepPerSec = (rpm * stepsPerRev * m["microsteps"]) / 60;
  const maxMaxV = 1 * ((15 * umPerStep) / m["microsteps"]).toFixed(3);
  const stall = String(m["homing-mode"] || "").startsWith("stall-");
  const maxStall = (() => { const rate = 900000 / m["stall-sample-time"], u = m["stall-microstep"]; return 1 * (((rate * 60) / 360 / 1000) * (m["step-angle"] / u) * m["travel-per-rev"]).toFixed(3); })();
  const stallRpm = (1000 * m["search-velocity"]) / m["travel-per-rev"];
  const stallUps = (stallRpm * stepsPerRev * m["stall-microstep"]) / 60;
  const extra = (k, tpl) => {
    switch (k) {
      case "microsteps": return `(${(ustepPerSec / 1000).toFixed(1)}k µstep/sec)`;
      case "max-velocity": return <span title="Revolutions per minute" className={maxMaxV < m["max-velocity"] ? "bad-text" : ""}>({rpm.toFixed(0)} RPM{maxMaxV < m["max-velocity"] ? `, limit ${maxMaxV}` : ""})</span>;
      case "max-accel": return metric ? `(${(m["max-accel"] * 0.0283254504).toFixed(3)} g)` : null;
      case "max-jerk": return metric ? `(${(m["max-jerk"] * 0.0283254504).toFixed(2)} g/min)` : null;
      case "step-angle": return `(${stepsPerRev.toFixed(0)} steps/rev)`;
      case "travel-per-rev": return metric ? `(${umPerStep.toFixed(1)} µm/step)` : `(${(umPerStep / 25.4).toFixed(2)} mil/step)`;
      case "min-switch": case "max-switch": return <span className="pin">Pin {tpl.pins[index]} <Io name={`${k}-${index}`} state={state} /></span>;
      case "search-velocity": return stall ? `(${stallRpm.toFixed(0)} RPM${maxStall < m["search-velocity"] ? `, limit ${maxStall}` : ""})` : null;
      case "stall-microstep": return `(${(stallUps / 1000).toFixed(1)}k µstep/sec)`;
      default: return null;
    }
  };
  const visible = (tpl) => !tpl.hmodes || tpl.hmodes.includes(m["homing-mode"]);
  const onSet = (k, v) => cfg.edit((x) => {
    const mm = x.motors[index]; mm[k] = v;
    if (k === "max-velocity" || k === "search-velocity" || k === "homing-mode" || k === "stall-microstep" || k === "stall-sample-time" || k === "step-angle" || k === "travel-per-rev" || k === "microsteps") {
      const um = (mm["travel-per-rev"] * mm["step-angle"]) / 0.36;
      const mx = 1 * ((15 * um) / mm["microsteps"]).toFixed(3);
      if (mx < mm["max-velocity"]) mm["max-velocity"] = mx;
      if (String(mm["homing-mode"]).startsWith("stall-")) {
        const rate = 900000 / mm["stall-sample-time"];
        const ms = 1 * (((rate * 60) / 360 / 1000) * (mm["step-angle"] / mm["stall-microstep"]) * mm["travel-per-rev"]).toFixed(3);
        if (ms < mm["search-velocity"]) mm["search-velocity"] = ms;
      }
    }
  });

  return (
    <Page title="Motors">
      <SubTabs items={c.motors.map((mm, i) => [String(i), `Motor ${i} · ${mm.axis}`])} value={String(index)} onChange={(v) => go(`motor:${v}`)} />
      <div className="cols">
        {Object.entries(tmpl).map(([cat, items]) => (
          <Group key={cat} title={cat[0].toUpperCase() + cat.slice(1)}>
            {Object.entries(items).filter(([, tpl]) => visible(tpl)).map(([k, tpl]) => (
              <Field key={k} id={`m${index}-${k}`} name={k} tpl={tpl} value={m[k]} metric={metric} extra={extra(k, tpl)} onChange={(v) => onSet(k, v)} />
            ))}
          </Group>
        ))}
      </div>
    </Page>
  );
}
