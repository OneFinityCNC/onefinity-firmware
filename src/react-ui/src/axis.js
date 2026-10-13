// Per-axis display values, ported from the original UI's axis-vars.js.
const IDX = { x: 0, y: 1, z: 2, a: 3 };

export function motorFor(config, axis) {
  const m = config?.motors || [];
  for (let i = 0; i < m.length; i++) if ((m[i].axis || "").toLowerCase() === axis) return i;
  return -1;
}

export function axisEnabled(state, config, axis) {
  const n = (config?.motors || []).length || 4;
  for (let i = 0; i < n; i++) if (state[`${i}an`] === IDX[axis]) return true;
  return false;
}

export function computeAxis(state, config, axis, metric) {
  const abs = state[`${axis}p`] || 0;
  const off = state[`offset_${axis}`] || 0;
  const id = motorFor(config, axis);
  const motor = id === -1 ? {} : config.motors[id];
  const homed = !!state[`${id}homed`];
  const min = state[`${id}tn`], max = state[`${id}tm`];
  const dim = max - min;
  const pMin = state[`path_min_${axis}`], pMax = state[`path_max_${axis}`];
  const pDim = pMax - pMin;
  const under = pMin + off < min, over = max < pMax + off;
  const fault = (state[`${id}df`] || 0) & 0x1f;
  const shutdown = state.power_shutdown;
  const len = (v) => (metric ? `${v.toLocaleString()} mm` : `${(v / 25.4).toLocaleString()} in`);

  let status = "UNHOMED";
  if (fault || shutdown) status = shutdown ? "SHUTDOWN" : "FAULT";
  else if (homed) status = "HOMED";

  let fit = "NO FILE", fitMsg = "";
  if (isFinite(pDim)) {
    if (0 < dim && dim < pDim) { fit = "NO FIT"; fitMsg = `The program is ${len(pDim)} on ${axis.toUpperCase()}, but the axis only has ${len(dim)} of travel.`; }
    else if (over || under) {
      fit = over ? "OVER" : "UNDER";
      fitMsg = over
        ? `The program would go ${len(pMax + off - max)} past the top limit with the current offset.`
        : `The program would go ${len(min - pMin - off)} past the bottom limit with the current offset.`;
    } else { fit = "OK"; fitMsg = `Program fits on ${axis.toUpperCase()}.`; }
  }

  return {
    axis, abs, off, pos: Math.abs(abs - off) < 1e-5 ? 0 : abs - off,
    min, max, dim, pMin, pMax, pDim, motor: id, homed, homingMode: motor["homing-mode"],
    enabled: axisEnabled(state, config, axis), status, fit, fitMsg,
  };
}

export const fmtLen = (mm, metric, p = 3) => (metric ? mm.toFixed(p) : (mm / 25.4).toFixed(p + 1));
export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
