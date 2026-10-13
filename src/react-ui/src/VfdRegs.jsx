import React from "react";
import { Group } from "./ui.jsx";
import { VFD_NOTES } from "./vfdNotes.js";

// Renders "#[tt baud]" markup from the original notes as <tt> text.
const rich = (s) => String(s).split(/(#\[tt [^\]]+\])/).map((p, i) => (p.startsWith("#[tt ") ? <tt key={i}>{p.slice(5, -1)}</tt> : p));

export function VfdNotes({ toolType }) {
  const n = VFD_NOTES.find((x) => (x.kind === "eq" ? toolType === x.key : toolType.startsWith(x.key)));
  if (!n) return null;
  return (
    <Group title="Notes">
      <p className="note">Set the following using the VFD's front panel.</p>
      <table className="grid-table">
        <thead><tr><th>Address</th><th>Value</th><th>Meaning</th><th>Description</th></tr></thead>
        <tbody>{n.rows.map((r, i) => <tr key={i}><th>{r[0]}</th><td>{r[1]}</td><td>{rich(r[2])}</td><td>{rich(r[3])}</td></tr>)}</tbody>
      </table>
      {n.href && <p className="note">Other settings according to the <a href={n.href} target="_blank" rel="noreferrer">{n.link}</a> and spindle type. {n.extra}</p>}
    </Group>
  );
}

const hasUserValue = (type) => type.includes("write") || type.includes("fixed") || type.includes("scaled");

// Active program (read-only, from the controller) and the editable program for a custom VFD.
export function VfdProgram({ cfg, state, send, template, toolType }) {
  const c = cfg.config;
  const rt = template["modbus-spindle"].regs;
  const types = rt.template["reg-type"].values;
  const idx = rt.index;
  const regs = c["modbus-spindle"].regs || [];
  const isCustom = toolType === "CUSTOM MODBUS VFD";
  const typeOf = (r) => types[state[`${r}vt`]];
  const fails = (r) => { const f = state[`${r}vr`]; return f === 255 ? "Max" : f; };
  const num = (v) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : 0; };

  const customize = () => cfg.edit((x) => {
    x.tool["tool-type"] = "Custom Modbus VFD";
    x["modbus-spindle"].regs.forEach((reg, i) => {
      const r = idx[i];
      reg["reg-type"] = typeOf(r); reg["reg-addr"] = state[`${r}va`]; reg["reg-value"] = state[`${r}vv`];
    });
  });
  const clear = () => cfg.edit((x) => {
    x.tool["tool-type"] = "Custom Modbus VFD";
    x["modbus-spindle"].regs.forEach((reg) => { reg["reg-type"] = "disabled"; reg["reg-addr"] = 0; reg["reg-value"] = 0; });
  });
  const resetFails = () => regs.forEach((_, i) => send(`$${i}vr=0`));
  const setReg = (i, key, val) => cfg.edit((x) => { x["modbus-spindle"].regs[i][key] = val; });

  const active = [...idx].filter((r) => state[`${r}vt`]);
  return (
    <>
      <Group title="Active Modbus program">
        {cfg.modified && <p className="note">Save to activate the selected tool type.</p>}
        <table className="grid-table">
          <thead><tr><th>Index</th><th>Command</th><th>Address</th><th>Value</th><th>Failures</th></tr></thead>
          <tbody>
            {[...idx].map((r, i) => (state[`${r}vt`] ? (
              <tr key={r} className={fails(r) ? "bad-row" : ""}><th>{i}</th><td>{typeOf(r)}</td><td>{state[`${r}va`]}</td><td>{state[`${r}vv`]}</td><td>{fails(r)}</td></tr>
            ) : null))}
            {!active.length && <tr><td colSpan="5" className="dim">No registers are active.</td></tr>}
          </tbody>
        </table>
        <div className="btnrow">
          <button onClick={customize}>Customize</button>
          {isCustom && <button onClick={clear}>Clear</button>}
          <button onClick={resetFails}>Reset failures</button>
        </div>
      </Group>
      {isCustom && (
        <Group title="Edit Modbus program">
          <table className="grid-table">
            <thead><tr><th>Index</th><th>Command</th><th>Address</th><th>Value</th></tr></thead>
            <tbody>
              {regs.map((reg, i) => {
                const type = reg["reg-type"];
                if (i && type === "disabled" && regs[i - 1]["reg-type"] === "disabled") return null;
                return (
                  <tr key={i}>
                    <th>{i}</th>
                    <td><select aria-label={`Register ${i} command`} value={type} onChange={(e) => setReg(i, "reg-type", e.target.value)}>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                    <td><input aria-label={`Register ${i} address`} type="number" inputMode="numeric" min={rt.template["reg-addr"].min} max={rt.template["reg-addr"].max} disabled={type === "disabled"} value={reg["reg-addr"]} onChange={(e) => setReg(i, "reg-addr", num(e.target.value))} /></td>
                    <td><input aria-label={`Register ${i} value`} type="number" inputMode="numeric" min={rt.template["reg-value"].min} max={rt.template["reg-value"].max} disabled={!hasUserValue(type)} value={reg["reg-value"]} onChange={(e) => setReg(i, "reg-value", num(e.target.value))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Group>
      )}
    </>
  );
}
