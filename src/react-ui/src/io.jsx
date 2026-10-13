import React from "react";

const OUT_MODES = { 0: "Disabled", 1: "Lo/Hi", 2: "Hi/Lo", 3: "Tri/Lo", 4: "Tri/Hi", 5: "Lo/Tri", 6: "Hi/Tri" };

function level(st) { return st === 0 ? "Lo/Gnd" : st === 1 ? "Hi/+3.3v" : st === 2 ? "Tristated" : null; }
function tip(mode, active, st) {
  const l = level(st);
  if (mode === undefined || active === undefined || l === null) return "Invalid";
  return `Mode: ${mode}\nActive: ${active ? "True" : "False"}\nLevel: ${l}`;
}
function input(state, sc, tc) {
  const type = state[tc], st = state[sc];
  const active = type === 1 ? !st : type === 2 ? !!st : false;
  const mode = type === 0 ? "Disabled" : type === 1 ? "Normally open" : type === 2 ? "Normally closed" : undefined;
  return { active, st, title: type === 0 ? "Disabled" : tip(mode, active, st) };
}
function output(state, o) {
  const m = state[`${o}om`];
  const active = state[`${o}oa`], st = state[`${o}os`];
  return { active, st, title: m === 0 ? "Disabled" : tip(OUT_MODES[m], active, st) };
}

export function ioInfo(state, name) {
  let m;
  if ((m = /^min-switch-(\d)$/.exec(name))) return input(state, `${m[1]}lw`, `${m[1]}ls`);
  if ((m = /^max-switch-(\d)$/.exec(name))) return input(state, `${m[1]}xw`, `${m[1]}xs`);
  switch (name) {
    case "estop": return input(state, "ew", "et");
    case "probe": return input(state, "pw", "pt");
    case "load-1": return output(state, "1");
    case "load-2": return output(state, "2");
    case "fault": return output(state, "f");
    case "tool-enable-mode": return output(state, "e");
    case "tool-direction-mode": return output(state, "d");
    default: return { title: "Invalid" };
  }
}

export function Io({ name, state }) {
  const { active, st, title } = ioInfo(state, name);
  let cls = "io", glyph = "!";
  if (active === undefined || st === undefined) cls += " warn";
  else if (st === 2) glyph = "○";
  else { glyph = st ? "+" : "−"; cls += active ? " active" : " inactive"; }
  return <span className={cls} title={title} aria-label={title.replace(/\n/g, ", ")}>{glyph}</span>;
}
