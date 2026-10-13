import React from "react";
import { Io } from "./io.jsx";
import { status_to_string } from "./modbus.js";

const MIN_PIN = [3, 5, 9, 11], MAX_PIN = [4, 8, 10, 12];
const bool = (v) => (v ? "Yes" : "No");

function Faults({ state, send }) {
  const flag = (m, bit) => {
    const f = state[`${m}df`];
    if (f === undefined) return <span className="io warn" title="Unknown">?</span>;
    return (f & (1 << bit)) ? <span className="io bad" title="Fault">✕</span> : <span className="io ok" title="OK">✓</span>;
  };
  const reset = (m) => send(m === undefined ? [0, 1, 2, 3].map((i) => `\\$${i}df=0`).join("\n") : `\\$${m}df=0`);
  return (
    <table className="grid-table">
      <thead><tr><th>Motor</th><th title="Overtemperature">Temp</th><th title="Overcurrent channel A">A over</th><th title="Predriver fault channel A">A driver</th><th title="Overcurrent channel B">B over</th><th title="Predriver fault channel B">B driver</th><th title="Driver communication failure">Comms</th><th><button className="quiet" onClick={() => reset()}>Reset all</button></th></tr></thead>
      <tbody>
        {[0, 1, 2, 3].map((m) => (
          <tr key={m}><th>{m}</th><td>{flag(m, 0)}</td><td>{flag(m, 1)}</td><td>{flag(m, 3)}</td><td>{flag(m, 2)}</td><td>{flag(m, 4)}</td><td>{flag(m, 8)}</td><td><button className="quiet" onClick={() => reset(m)}>Reset</button></td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Indicators({ state, send }) {
  const n = (v, d) => (v === undefined || v === null || isNaN(v) ? "—" : Number(v).toFixed(d));
  const pwr = [
    ["Under voltage", "under_voltage"], ["Over voltage", "over_voltage"], ["Over current", "over_current"], ["Sense error", "sense_error"],
    ["Shunt overload", "shunt_overload"], ["Shunt error", "shunt_error"], ["Load 1 shutdown", "load1_shutdown"], ["Load 2 shutdown", "load2_shutdown"],
    ["Motor under voltage", "motor_under_voltage"], ["Motor overload", "motor_overload"], ["Power shutdown", "power_shutdown"],
  ];
  return (
    <div className="indicators">
      <p className="legend"><span className="io warn">!</span> unknown · <span className="io active">+</span> high, active · <span className="io inactive">−</span> low, inactive · <span className="io">○</span> tristated or disabled. Hover a dot for details.</p>
      <div className="cols">
        <section className="group"><h2>Inputs</h2>
          <table className="grid-table"><thead><tr><th>Name</th><th>Pin</th><th>State</th></tr></thead><tbody>
            {[0, 1, 2, 3].flatMap((m) => [
              <tr key={`l${m}`}><th>Motor {m} min</th><td>{MIN_PIN[m]}</td><td><Io name={`min-switch-${m}`} state={state} /></td></tr>,
              <tr key={`x${m}`}><th>Motor {m} max</th><td>{MAX_PIN[m]}</td><td><Io name={`max-switch-${m}`} state={state} /></td></tr>,
            ])}
            <tr><th>E-stop</th><td>23</td><td><Io name="estop" state={state} /></td></tr>
            <tr><th>Probe</th><td>22</td><td><Io name="probe" state={state} /></td></tr>
          </tbody></table>
        </section>
        <section className="group"><h2>Outputs</h2>
          <table className="grid-table"><thead><tr><th>Name</th><th>Pin</th><th>State</th></tr></thead><tbody>
            <tr><th>Tool enable</th><td>15</td><td><Io name="tool-enable-mode" state={state} /></td></tr>
            <tr><th>Tool direction</th><td>16</td><td><Io name="tool-direction-mode" state={state} /></td></tr>
            <tr><th>Tool PWM</th><td>17</td><td>{n((state.pd || 0) * 100, 0)}%</td></tr>
            <tr><th>Load 1</th><td>2</td><td><Io name="load-1" state={state} /></td></tr>
            <tr><th>Load 2</th><td>1</td><td><Io name="load-2" state={state} /></td></tr>
            <tr><th>Fault</th><td>21</td><td><Io name="fault" state={state} /></td></tr>
          </tbody></table>
          <h2>Measurements</h2>
          <table className="grid-table"><tbody>
            <tr><th>Input</th><td>{n(state.vin, 1)} V</td><th>Output</th><td>{n(state.vout, 1)} V</td></tr>
            <tr><th>Motor</th><td>{n(state.motor, 2)} A</td><th>Low-side</th><td>{n(state.vdd, 2)} A</td></tr>
            <tr><th>Load 1</th><td>{n(state.load1, 2)} A</td><th>Load 2</th><td>{n(state.load2, 2)} A</td></tr>
            <tr><th>Board</th><td>{n(state.temp, 0)} °C</td><th>Raspberry Pi</th><td className={state.rpi_temp >= 80 ? "bad-text" : ""}>{n(state.rpi_temp, 0)} °C</td></tr>
          </tbody></table>
        </section>
        <section className="group"><h2>Power faults{state.pwr_version ? ` (version ${state.pwr_version})` : ""}</h2>
          <table className="grid-table"><tbody>
            {pwr.map(([label, key]) => <tr key={key} className={state[key] ? "bad-row" : ""}><th>{label}</th><td>{bool(state[key])}</td></tr>)}
          </tbody></table>
        </section>
        <section className="group"><h2>Motor faults</h2><Faults state={state} send={send} />
          <h2>VFD</h2><table className="grid-table"><tbody><tr><th>Modbus</th><td>{status_to_string(state.mx)}</td></tr></tbody></table>
        </section>
      </div>
    </div>
  );
}
