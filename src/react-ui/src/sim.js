

// Depth-map stock simulation used by the "Depth view" in the path viewer.
//
// The planner already gives us the tool path as a list of vertices
// (positions: x,y,z triples, in mm) and a matching list of speeds, where a
// NaN speed marks a rapid move.  This module replays that path against a
// height map of the stock (0 = stock top, negative = material removed) so the
// operator can see what the program will cut before running it.
//
// No DOM access here, so it can be tested under Node.

const MAX_CELLS = 360000; // keeps the grid around 600 x 600 at most
const MIN_RES = 0.25;     // mm


export function makeGrid(bounds, radius) {
    const pad = radius + 2;
    let x0 = bounds.min.x - pad, x1 = bounds.max.x + pad;
    let y0 = bounds.min.y - pad, y1 = bounds.max.y + pad;

    if (!isFinite(x0) || !isFinite(x1) || !isFinite(y0) || !isFinite(y1)) {
        throw new Error("Tool path has no X/Y extent");
    }

    const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
    let res = Math.max(MIN_RES, Math.sqrt((w * h) / MAX_CELLS));
    res = Math.max(res, radius / 6); // never finer than needed for the tool

    return {
        x0: x0, y1: y1, res: res,
        nx: Math.ceil(w / res), ny: Math.ceil(h / res)
    };
}


// tool: { radius: mm, vAngle: included angle in degrees, or 0 for flat }
export function makeTool(radius, vAngle) {
    const slope = vAngle > 0 ? 1 / Math.tan(vAngle * Math.PI / 360) : 0;
    return { radius: radius, slope: slope };
}


export function stamp(grid, h, tool, cx, cy, cz) {
    const R = tool.radius, res = grid.res;
    const j0 = Math.max(Math.floor((cx - R - grid.x0) / res), 0);
    const j1 = Math.min(Math.ceil((cx + R - grid.x0) / res), grid.nx - 1);
    const i0 = Math.max(Math.floor((grid.y1 - (cy + R)) / res), 0);
    const i1 = Math.min(Math.ceil((grid.y1 - (cy - R)) / res), grid.ny - 1);
    const R2 = R * R, slope = tool.slope;

    for (let i = i0; i <= i1; i++) {
        const gy = grid.y1 - (i + 0.5) * res;
        const dy = gy - cy;
        const row = i * grid.nx;

        for (let j = j0; j <= j1; j++) {
            const dx = grid.x0 + (j + 0.5) * res - cx;
            const r2 = dx * dx + dy * dy;
            if (r2 > R2) continue;

            const z = slope ? cz + Math.sqrt(r2) * slope : cz;
            if (z < h[row + j]) h[row + j] = z;
        }
    }
}


export function heightAt(grid, h, x, y) {
    const j = Math.floor((x - grid.x0) / grid.res);
    const i = Math.floor((grid.y1 - y) / grid.res);
    if (j < 0 || i < 0 || j >= grid.nx || i >= grid.ny) return 0;
    return h[i * grid.nx + j];
}


// Replay vertices (from, to] onto h.  Returns the number of rapid moves that
// went below the surface.  stockTop shifts Z so that the top of the stock is 0.
export function run(grid, h, tool, positions, speeds, from, to, stockTop) {
    const n = positions.length / 3;
    to = Math.min(to, n - 1);
    from = Math.max(from, 0);
    let rapidHits = 0;

    for (let v = from + 1; v <= to; v++) {
        const a = (v - 1) * 3, b = v * 3;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2] - stockTop;
        const bx = positions[b], by = positions[b + 1], bz = positions[b + 2] - stockTop;
        const rapid = isNaN(speeds[v]);

        const dist = Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az));
        const steps = Math.max(1, Math.ceil(dist / grid.res));

        let hit = false;
        for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            const cx = ax + (bx - ax) * t;
            const cy = ay + (by - ay) * t;
            const cz = az + (bz - az) * t;

            if (rapid) {
                if (cz < 0 && cz < heightAt(grid, h, cx, cy) - 0.05) hit = true;
                continue; // rapids never cut in the preview
            }

            if (tool.slope === 0 && cz >= 0) continue; // flat tool in air
            if (tool.slope && cz >= tool.radius * tool.slope) continue;

            stamp(grid, h, tool, cx, cy, cz);
        }

        if (hit) rapidHits++;
    }

    return rapidHits;
}


