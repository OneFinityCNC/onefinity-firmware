"use strict";

// Depth view: replays the planned tool path against a height map of the stock
// and shows what each program has cut so far.  See cut-sim.js for the engine.

const cookie = require("./cookie")("bbctrl-");
const sim = require("./cut-sim");

const SNAPSHOTS = 12;       // checkpoints used to make scrubbing quick
const FRAME_MS = 40;        // time budget per slice when simulating
const PLAY_SECONDS = 20;    // a whole program plays in about this long at 1x

// Viridis, sampled at nine points and interpolated into a 256 entry table.
const STOPS = [
    [253, 231, 37], [186, 222, 40], [122, 209, 81], [68, 191, 112],
    [34, 168, 132], [32, 144, 140], [42, 120, 142], [65, 68, 135], [68, 1, 84]
];

const LUT = (function() {
    const lut = new Uint8ClampedArray(256 * 3);

    for (let i = 0; i < 256; i++) {
        const p = i / 255 * (STOPS.length - 1);
        const k = Math.min(Math.floor(p), STOPS.length - 2);
        const f = p - k;

        for (let c = 0; c < 3; c++) {
            lut[i * 3 + c] = STOPS[k][c] + (STOPS[k + 1][c] - STOPS[k][c]) * f;
        }
    }

    return lut;
})();


module.exports = {
    template: "#cut-preview-template",
    props: [ "path", "active" ],

    data: function() {
        return {
            toolDia: parseFloat(cookie.get("depth-tool-dia", "6.35")) || 6.35,
            toolType: cookie.get("depth-tool-type", "flat"),
            vAngle: parseFloat(cookie.get("depth-v-angle", "60")) || 60,
            stockTop: 0,
            busy: false,
            percent: 0,
            position: 0,
            last: 0,
            playing: false,
            rapidHits: 0,
            zmin: 0,
            error: ""
        };
    },

    computed: {
        readout: function() {
            if (!this.path || !this.last) return "";
            const v = Math.min(this.position, this.last) * 3;
            const p = this.path.positions;
            const pct = Math.round(this.position / this.last * 100);

            return pct + "%   X " + p[v].toFixed(1) + "  Y " + p[v + 1].toFixed(1) +
                "  Z " + (p[v + 2] - this.stockTop).toFixed(2);
        },

        depthLabel: function() {
            return this.zmin.toFixed(1) + " mm";
        }
    },

    watch: {
        path: function() {
            this.restart();
        },

        active: function(on) {
            if (on) {
                if (!this.grid) this.restart();
            } else {
                this.stop();
            }
        }
    },

    ready: function() {
        if (this.active) this.restart();
    },

    beforeDestroy: function() {
        this.stop();
        this.token = (this.token || 0) + 1;
    },

    methods: {
        restart: function() {
            this.stop();
            cookie.set("depth-tool-dia", this.toolDia);
            cookie.set("depth-tool-type", this.toolType);
            cookie.set("depth-v-angle", this.vAngle);

            this.token = (this.token || 0) + 1;
            this.grid = undefined;

            if (!this.active || !this.path || !this.path.positions ||
                this.path.positions.length < 6) return;

            if (!(this.toolDia > 0)) {
                this.error = "Enter the tool diameter.";
                return;
            }

            this.error = "";
            this.build(this.token);
        },

        build: function(token) {
            const path = this.path;
            const radius = this.toolDia / 2;
            const nVerts = path.positions.length / 3;

            this.tool = sim.makeTool(radius, this.toolType == "v" ? this.vAngle : 0);
            this.grid = sim.makeGrid(path.bounds, radius);
            this.h = new Float32Array(this.grid.nx * this.grid.ny);
            this.snaps = [ { v: 0, h: new Float32Array(this.h) } ];
            this.last = nVerts - 1;
            this.zmin = Math.min((path.bounds.min.z || 0) - this.stockTop, -0.1);
            this.rapidHits = 0;
            this.busy = true;
            this.percent = 0;

            const canvas = this.$el.querySelector("canvas.depth");
            canvas.width = this.grid.nx;
            canvas.height = this.grid.ny;
            const marker = this.$el.querySelector("canvas.marker");
            marker.width = this.grid.nx;
            marker.height = this.grid.ny;
            this.image = canvas.getContext("2d").createImageData(this.grid.nx, this.grid.ny);

            const step = Math.ceil(nVerts / SNAPSHOTS);
            let v = 0, nextSnap = step;

            const slice = () => {
                if (token != this.token) return;

                const t0 = Date.now();
                while (v < this.last && Date.now() - t0 < FRAME_MS) {
                    const to = Math.min(v + 2000, this.last, nextSnap);
                    this.rapidHits += sim.run(this.grid, this.h, this.tool,
                        path.positions, path.speeds, v, to, this.stockTop);
                    v = to;

                    if (v == nextSnap) {
                        this.snaps.push({ v: v, h: new Float32Array(this.h) });
                        nextSnap += step;
                    }
                }

                this.percent = Math.round(v / this.last * 100);

                if (v < this.last) {
                    setTimeout(slice, 0);
                } else {
                    this.busy = false;
                    this.position = this.last;
                    this.draw(this.last);
                }
            };

            setTimeout(slice, 0);
        },

        // Rebuild the height map as it stood after vertex v, from the nearest
        // earlier checkpoint.
        seek: function(v) {
            let snap = this.snaps[0];
            for (const s of this.snaps) if (s.v <= v) snap = s;

            this.h.set(snap.h);
            sim.run(this.grid, this.h, this.tool, this.path.positions,
                this.path.speeds, snap.v, v, this.stockTop);
        },

        draw: function(v) {
            if (!this.grid || this.busy && v != this.last) return;

            if (v != this.last || this.drawnLast === false) this.seek(v);
            this.drawnLast = v == this.last;

            const g = this.grid, h = this.h, nx = g.nx, ny = g.ny;
            const data = this.image.data, zmin = this.zmin;

            for (let i = 0; i < ny; i++) {
                const up = Math.max(i - 1, 0) * nx, dn = Math.min(i + 1, ny - 1) * nx;
                const row = i * nx;

                for (let j = 0; j < nx; j++) {
                    const k = row + j;
                    const lf = h[row + Math.max(j - 1, 0)], rt = h[row + Math.min(j + 1, nx - 1)];
                    const light = 1 + 0.08 * (lf - rt + h[dn + j] - h[up + j]);
                    const shade = Math.min(Math.max(light, 0.7), 1.25);

                    let d = h[k] / zmin;
                    d = d < 0 ? 0 : d > 1 ? 1 : d;
                    const c = Math.round(d * 255) * 3, o = k * 4;

                    data[o] = LUT[c] * shade;
                    data[o + 1] = LUT[c + 1] * shade;
                    data[o + 2] = LUT[c + 2] * shade;
                    data[o + 3] = 255;
                }
            }

            const canvas = this.$el.querySelector("canvas.depth");
            canvas.getContext("2d").putImageData(this.image, 0, 0);
            this.draw_marker(v);
        },

        draw_marker: function(v) {
            const marker = this.$el.querySelector("canvas.marker");
            const ctx = marker.getContext("2d");
            const g = this.grid;
            ctx.clearRect(0, 0, marker.width, marker.height);

            const p = this.path.positions;
            const x = (p[v * 3] - g.x0) / g.res;
            const y = (g.y1 - p[v * 3 + 1]) / g.res;
            const r = this.tool.radius / g.res;

            ctx.lineWidth = Math.max(2, marker.width / 250);
            ctx.strokeStyle = "#fff";
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.lineWidth = ctx.lineWidth / 2.5;
            ctx.strokeStyle = "#111";
            ctx.stroke();
        },

        scrub: function(event) {
            this.stop();
            this.position = parseInt(event.target.value, 10) || 0;
            this.draw(this.position);
        },

        toggle_play: function() {
            if (this.playing) {
                this.stop();
                return;
            }

            if (this.busy || !this.grid) return;
            if (this.position >= this.last) this.position = 0;

            this.playing = true;
            let prev = performance.now();
            const perMs = this.last / (PLAY_SECONDS * 1000);

            const tick = (now) => {
                if (!this.playing) return;

                this.position = Math.min(this.last,
                    this.position + Math.max(1, Math.round((now - prev) * perMs)));
                prev = now;
                this.draw(this.position);

                if (this.position >= this.last) {
                    this.playing = false;
                } else {
                    this.raf = window.requestAnimationFrame(tick);
                }
            };

            this.raf = window.requestAnimationFrame(tick);
        },

        stop: function() {
            this.playing = false;
            if (this.raf) window.cancelAnimationFrame(this.raf);
            this.raf = undefined;
        }
    }
};
