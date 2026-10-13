// Measure stock with a 3D touch probe (a stylus probe held in the collet).
//
// The operator puts the stylus roughly over the middle of the stock, a few mm
// above it, and gives the approximate size.  One program then:
//   1. touches the top (Z),
//   2. drops beside the left and right ends and touches each one,
//   3. optionally does the same on the front and back faces,
//   4. sets the work zero (Z on the top, X/Y on the chosen corner or center).
//
// Every move with the probe in the collet is a guarded move (G38.3): if the
// stylus touches anything on the way (a clamp, a vise jaw, stock that is
// bigger than typed), the move stops and the rest of the program is skipped.
// Touches that must find an edge use G38.2, which stops the machine with
// "Switch not found" if there is nothing there.
//
// Results are reported through global variables (#<_ofm_*>), which the
// controller publishes to the UI as ofm_*.  All values are mm.

export const MEASURE_DEFAULTS = {
  ball: 2,         // effective stylus ball diameter (calibrated)
  clear: 5,        // travel height above the stock top
  depth: 3,        // how far below the top the sides are touched
  margin: 10,      // how far outside the expected edge the stylus drops
  travel: 1000,    // mm/min for guarded travel moves
};

// Why a guarded move stopped (ofm_fail)
export const FAILS = {
  1: "The stylus touched something while moving to the left end. Look for a clamp in the way, or raise the travel height.",
  2: "The stylus touched something while dropping beside the left end. The stock may be bigger than the size you typed, or something is in the way there.",
  3: "The stylus touched something while moving to the right end. Look for a clamp in the way, or raise the travel height.",
  4: "The stylus touched something while dropping beside the right end. The stock may be longer than the size you typed, or something is in the way there.",
  5: "The stylus touched something while moving to the middle of the stock.",
  6: "The stylus touched something while moving out to the front face. If the vise jaws stand higher than the stock, untick the front and back faces, or raise the travel height.",
  7: "The stylus touched something while dropping in front of the stock. The vise jaw may be higher than the stock, or the stock is deeper than you typed. Untick the front and back faces and try again.",
  8: "The stylus touched something while moving to the back face. If the vise jaws stand higher than the stock, untick the front and back faces, or raise the travel height.",
  9: "The stylus touched something while dropping behind the stock. The vise jaw may be higher than the stock, or the stock is deeper than you typed. Untick the front and back faces and try again.",
};

// Origins.  With the front/back faces probed, any corner or the center.
// Without them, X only (Y zero is left as it is).
export const ORIGINS_XY = [
  ["center", "Center of the stock"], ["front-left", "Front-left corner"], ["front-right", "Front-right corner"],
  ["back-left", "Back-left corner"], ["back-right", "Back-right corner"],
];
export const ORIGINS_X = [["x-left", "Left end (Y zero not changed)"], ["center-x", "X center (Y zero not changed)"], ["x-right", "Right end (Y zero not changed)"]];

const n = (v) => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

export function checkOpts(o) {
  const errs = [];
  if (!(o.w > 0)) errs.push("Type the approximate X size of the stock.");
  if (o.probeY && !(o.l > 0)) errs.push("Type the approximate Y size of the stock.");
  if (o.w > 1500 || o.l > 1500) errs.push("That size is bigger than the machine.");
  if (!(o.ball >= 0 && o.ball <= 10)) errs.push("Stylus ball diameter must be 0 to 10 mm.");
  if (!(o.clear >= 2 && o.clear <= 50)) errs.push("Travel height must be 2 to 50 mm.");
  if (!(o.depth >= 1 && o.depth <= 15)) errs.push("Touch depth must be 1 to 15 mm.");
  if (!(o.margin >= 3 && o.margin <= 50)) errs.push("Drop distance must be 3 to 50 mm.");
  if (!(o.travel >= 100 && o.travel <= 3000)) errs.push("Travel speed must be 100 to 3000 mm/min.");
  if (!(o.fast > 0 && o.slow > 0)) errs.push("Probe seek speeds are not set.");
  return errs;
}

// o: {w, l, probeY, origin, ball, clear, depth, margin, travel, fast, slow, calibrate}
export function measureProgram(o) {
  const r = o.ball / 2;
  const up = o.clear + o.depth;
  const search = 2 * o.margin + 2;
  let oid = 200;
  const out = [];
  const add = (s) => out.push(s.replace(/^\n/, ""));

  // Run a block only if nothing has gone wrong so far
  const guard = (body) => { const id = oid++; add(`o${id} if [#<_ofm_fail> EQ 0]\n${body}\no${id} endif`); };

  // A move that stops on contact.  backOff moves the stylus off whatever it
  // touched, then it lifts clear.
  const guarded = (axis, dist, feed, code, backOff, lift) => {
    const id = oid++;
    return `G91 G38.3 ${axis}${dist} F${feed}
o${id} if [#5070 EQ 1]
#<_ofm_fail> = ${code}
G91 G1 ${backOff} F${o.fast}${lift ? `\nG91 G0 Z${n(lift)}` : ""}
o${id} endif`;
  };

  // Touch an edge: fast seek, back off 1 mm, slow seek.
  const touch = (axis, dir) => `G91 G38.2 ${axis}${n(dir * search)} F${o.fast}
G91 G1 ${axis}${n(-dir)}
G91 G38.2 ${axis}${n(dir * 2)} F${o.slow}`;

  const lift = (axis, dir) => `G91 G1 ${axis}${n(-dir * 2)}\nG91 G0 Z${n(up)}`;

  add(`(Measure stock, ${o.calibrate ? "calibration" : "sets work zero"})
G21
#<_ofm_ok> = 0
#<_ofm_fail> = 0
#<_ofm_w> = 0
#<_ofm_l> = 0`);

  // 1. Top
  add(`G91 G38.2 Z-25 F${o.fast}
G91 G1 Z1
G91 G38.2 Z-2 F${o.slow}
#<_ofm_zt> = #5063
G91 G0 Z${n(o.clear)}`);

  // 2. Left end
  guard(guarded("X", n(-(o.w / 2 + o.margin + r)), o.travel, 1, "X2", 0));
  guard(guarded("Z", n(-up), o.fast, 2, "Z2", up));
  guard(`${touch("X", 1)}
#<_ofm_rxa> = #5061
#<_ofm_xa> = [#5061 + ${n(r)}]
${lift("X", 1)}`);

  // 3. Right end (planned from the measured left end)
  guard(guarded("X", `[#<_ofm_xa> + ${n(o.w + o.margin + r)} - [#5061 - 2]]`, o.travel, 3, "X-2", 0));
  guard(guarded("Z", n(-up), o.fast, 4, "Z2", up));

  const x0 = { "x-left": "#<_ofm_xa>", "front-left": "#<_ofm_xa>", "back-left": "#<_ofm_xa>",
    "x-right": "#<_ofm_xb>", "front-right": "#<_ofm_xb>", "back-right": "#<_ofm_xb>" }[o.origin]
    || "[[#<_ofm_xa> + #<_ofm_xb>] / 2]";
  const zero = (withY, y0) => o.calibrate ? "" :
    `G92 X[#5061 - ${x0}]${withY ? ` Y[#5062 - ${y0}]` : ""} Z[#5063 - #<_ofm_zt>]`;

  if (!o.probeY) {
    // Zero is set right after the last touch, where the current position is
    // exactly the touch position (#5061..#5063).
    guard(`${touch("X", -1)}
#<_ofm_rxb> = #5061
#<_ofm_xb> = [#5061 - ${n(r)}]
#<_ofm_w> = [#<_ofm_xb> - #<_ofm_xa>]
${zero(false)}
${lift("X", -1)}
#<_ofm_ok> = 1`);
  } else {
    guard(`${touch("X", -1)}
#<_ofm_rxb> = #5061
#<_ofm_xb> = [#5061 - ${n(r)}]
#<_ofm_w> = [#<_ofm_xb> - #<_ofm_xa>]
${lift("X", -1)}`);

    // 4. Front face, from the middle of the stock in X
    guard(guarded("X", "[[#<_ofm_xa> + #<_ofm_xb>] / 2 - [#5061 + 2]]", o.travel, 5, "Z2", 0));
    guard(guarded("Y", n(-(o.l / 2 + o.margin + r)), o.travel, 6, "Y2", 0));
    guard(guarded("Z", n(-up), o.fast, 7, "Z2", up));
    guard(`${touch("Y", 1)}
#<_ofm_rya> = #5062
#<_ofm_ya> = [#5062 + ${n(r)}]
${lift("Y", 1)}`);

    // 5. Back face
    guard(guarded("Y", `[#<_ofm_ya> + ${n(o.l + o.margin + r)} - [#5062 - 2]]`, o.travel, 8, "Y-2", 0));
    guard(guarded("Z", n(-up), o.fast, 9, "Z2", up));
    const y0 = o.origin.startsWith("front") ? "#<_ofm_ya>" : o.origin.startsWith("back") ? "#<_ofm_yb>" : "[[#<_ofm_ya> + #<_ofm_yb>] / 2]";
    guard(`${touch("Y", -1)}
#<_ofm_ryb> = #5062
#<_ofm_yb> = [#5062 - ${n(r)}]
#<_ofm_l> = [#<_ofm_yb> - #<_ofm_ya>]
${zero(true, y0)}
${lift("Y", -1)}
#<_ofm_ok> = 1`);
  }

  add("G90");
  // Park over the new zero at travel height
  if (!o.calibrate) add(`o${oid++} if [#<_ofm_ok> EQ 1]\nG90 G0 ${o.probeY ? "X0 Y0" : "X0"}\no${oid - 1} endif`);
  add("M2");
  return out.join("\n") + "\n";
}

// Effective ball diameter from a calibration run on a block of known width.
export const calibratedBall = (rxa, rxb, trueWidth) => Math.abs(rxb - rxa) - trueWidth;
