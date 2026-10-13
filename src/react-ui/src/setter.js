// Tool setter: a switch bolted to the table that every tool touches, so Z
// can be set for a new tool without putting a touch plate on the stock.
//
// "Reference" is the work Z the tool tip reads when it trips the setter,
// measured with a tool whose Z zero is right (the 3D probe straight after
// Measure stock, or any tool after a normal Z probe).  For any later tool the
// program touches the setter and sets the current work Z to that reference:
// both tips are then at the same physical height, so Z zero is right for the
// new tool too.
//
// Moves use machine coordinates (G53) so they don't depend on the work zero.
// The descent to the setter is guarded (G38.3) so a tool much longer than
// expected stops on contact instead of crashing.

export const SETTER_DEFAULTS = {
  clear: 30,     // start the touch this far above the saved height (covers longer tools)
  travel: 1000,  // mm/min for the guarded descent
};

export const SETTER_FAILS = {
  1: "The tool touched the setter before the slow touch started. This tool is more than the clearance longer than the one used to save the setter position. Raise the clearance, or save the setter position again with a longer tool.",
};

const n = (v) => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

// Is the probe input touched?  The controller reports the raw pin level (pw)
// and the input type (pt: 1 normally open, 2 normally closed).
export function probeActive(state) {
  if (state.pt === 2) return state.pw === 1;
  return state.pw === 0;
}

// o: {mode: "ref"|"tool", setter: {x, y, z} machine mm, top: machine Z to
//     travel at, back: {x, y} machine mm to return to, ref: work Z (tool mode),
//     clear, travel, fast, slow}
export function setterProgram(o) {
  const { x, y, z } = o.setter;
  const start = Math.min(o.top, z + o.clear);
  const descend = o.top - start;
  const search = start - z + 25;   // down to 25 mm below the saved height
  const lines = [
    `(Tool setter: ${o.mode === "ref" ? "reference" : "measure tool"})`,
    "G21",
    "#<_ofs_ok> = 0",
    "#<_ofs_fail> = 0",
    `G90 G53 G0 Z${n(o.top)}`,
    `G53 G0 X${n(x)} Y${n(y)}`,
  ];
  if (descend > 0.01) {
    lines.push(`G91 G38.3 Z${n(-descend)} F${o.travel}`,
      "o300 if [#5070 EQ 1]", "#<_ofs_fail> = 1", "o300 endif");
  }
  lines.push("o301 if [#<_ofs_fail> EQ 0]",
    `G91 G38.2 Z${n(-search)} F${o.fast}`,
    "G91 G1 Z1",
    `G91 G38.2 Z-2 F${o.slow}`,
    "#<_ofs_trip> = #5063",
    o.mode === "ref" ? "#<_ofs_ref> = #5063" : `G92 Z${n(o.ref)}`,
    "#<_ofs_ok> = 1",
    "o301 endif",
    `G90 G53 G0 Z${n(o.top)}`);
  if (o.back) lines.push(`G53 G0 X${n(o.back.x)} Y${n(o.back.y)}`);
  lines.push("G90", "M2");
  return lines.join("\n") + "\n";
}

// Reference record kept on the controller: {ref, offZ, time, by}.
// It is valid while the Z offset is still the one we left it at.
export function refStatus(rec, state) {
  if (!rec || typeof rec.ref !== "number") return { ok: false, why: "none" };
  if (typeof state.offset_z === "number" && typeof rec.offZ === "number" && Math.abs(state.offset_z - rec.offZ) > 0.01) {
    return { ok: false, why: "moved" };
  }
  return { ok: true };
}
