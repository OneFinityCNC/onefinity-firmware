"use strict";

module.exports = {
    props: [ "state", "config" ],

    computed: {
        metric: function() {
            return this.$root.display_units === "METRIC";
        },

        x: function() {
            return this._compute_axis("x");
        },

        y: function() {
            return this._compute_axis("y");
        },

        z: function() {
            return this._compute_axis("z");
        },

        a: function() {
            return this._compute_axis("a");
        },

        b: function() {
            return this._compute_axis("b");
        },

        c: function() {
            return this._compute_axis("c");
        },

        axes: function() {
            return this._compute_axes();
        }
    },

    methods: {
        _convert_length: function(value) {
            return this.metric
                ? value
                : value / 25.4;
        },

        _length_str: function(value) {
            return this._convert_length(value).toLocaleString() + (this.metric ? " mm" : " in");
        },

        _compute_axis: function(axis) {
            const abs = this.state[`${axis}p`] || 0;
            const off = this.state[`offset_${axis}`];
            const motor_id = this._get_motor_id(axis);
            const motor = motor_id == -1 ? {} : this.config.motors[motor_id];
            const enabled = this._check_is_enabled(axis);
            const homingMode = motor["homing-mode"];
            const homed = this.state[`${motor_id}homed`];
            const min = this.state[`${motor_id}tn`];
            const max = this.state[`${motor_id}tm`];
            const dim = max - min;
            const pathMin = this.state[`path_min_${axis}`];
            const pathMax = this.state[`path_max_${axis}`];
            const pathDim = pathMax - pathMin;
            const under = pathMin + off < min;
            const over = max < pathMax + off;
            let klass = `${homed ? "homed" : "unhomed"} axis-${axis}`;
            let state = "UNHOMED";
            let icon = "question-circle";
            const fault = this.state[`${motor_id}df`] & 0x1f;
            const shutdown = this.state.power_shutdown;
            let title;
            let ticon = "question-circle";
            let tstate = "NO FILE";
            let toolmsg;
            let tklass = `${homed ? "homed" : "unhomed"} axis-${axis}`;

            if (fault || shutdown) {
                state = shutdown ? "SHUTDOWN" : "FAULT";
                klass += " error";
                icon = "exclamation-circle";
            } else if (homed) {
                state = "HOMED";
                icon = "check-circle";
            }

            if (0 < dim && dim < pathDim) {
                tstate = "NO FIT";
                tklass += " error";
                ticon = "ban";
            } else {
                if (over || under) {
                    tstate = over ? "OVER" : "UNDER";
                    tklass += " warn";
                    ticon = "exclamation-circle";
                } else {
                    tstate = "OK";
                    ticon = "check-circle";
                }
            }

            switch (state) {
                case "UNHOMED":
                    title = "Click the home button to home axis.";
                    break;

                case "HOMED":
                    title = "Axis successfuly homed.";
                    break;

                case "FAULT":
                    title = [
                        `Motor driver fault.  A potentially damaging electrical`,
                        `condition was detected and the motor driver was shutdown.`,
                        `Please power down the controller and check your motor cabling.`,
                        `See the "Motor Faults" table on the "Indicators" tab for more`,
                        `information.`,
                    ].join(" ");
                    break;

                case "SHUTDOWN":
                    title = [
                        `Motor power fault.  All motors in shutdown.`,
                        `See the "Power Faults" table on the "Indicators" tab for more`,
                        `information.  Reboot controller to reset.`
                    ].join(" ");
                    break;
            }

            switch (tstate) {
                case "OVER":
                    toolmsg = [
                        `Caution: The current tool path file would move`,
                        `${this._length_str(pathMax + off - max)}`,
                        `above axis limit with the current offset.`
                    ].join(" ");
                    break;

                case "UNDER":
                    toolmsg = [
                        `Caution: The current tool path file would move`,
                        `${this._length_str(min - pathMin - off)}`,
                        `below limit with the current offset.`
                    ].join(" ");
                    break;

                case "NO FIT":
                    toolmsg = [
                        `Warning: The current tool path dimensions`,
                        `(${this._length_str(pathDim)}) exceed axis dimensions`,
                        `(${this._length_str(dim)}) by ${this._length_str(pathDim - dim)}.`
                    ].join(" ");
                    break;

                default:
                    toolmsg = `Tool path ${axis} dimensions OK.`;
                    break;
            }

            return {
                pos: Math.abs(abs - off) < 0.00001 ? 0 : abs - off,
                abs: abs,
                off: off,
                min: min,
                max: max,
                dim: dim,
                pathMin: pathMin,
                pathMax: pathMax,
                pathDim: pathDim,
                motor: motor_id,
                enabled: enabled,
                homingMode: homingMode,
                homed: homed,
                klass: klass,
                state: state,
                icon: icon,
                title: title,
                ticon: ticon,
                tstate: tstate,
                toolmsg: toolmsg,
                tklass: tklass
            };
        },

        _get_motor_id: function(axis) {
            for (let i = 0; i < this.config.motors.length; i++) {
                const motor = this.config.motors[i];
                if (motor.axis.toLowerCase() == axis) {
                    return i;
                }
            }

            return -1;
        },

        _check_is_enabled: function(axis){
            const axes = { x: 0, y: 1, z: 2, a: 3 };
            for(let i = 0; i < this.config.motors.length; i++){
                if(this.state[`${i}an`] == axes[axis]){
                    return true;
                }
            }
            return false;
        },

        _compute_axes: function() {
            let homed = false;

            for (const name of "xyzabc") {
                const axis = this[name];

                if (!axis.enabled) {
                    continue;
                }

                if (!axis.homed) {
                    homed = false; break;
                }

                homed = true;
            }

            let error = false;
            let warn = false;

            if (homed) {
                for (const name of "xyzabc") {
                    const axis = this[name];

                    if (!axis.enabled) {
                        continue;
                    }

                    if (axis.klass.indexOf("error") != -1) {
                        error = true;
                    }

                    if (axis.klass.indexOf("warn") != -1) {
                        warn = true;
                    }
                }
            }

            let klass = homed ? "homed" : "unhomed";
            if (error) {
                klass += " error";
            } else if (warn) {
                klass += " warn";
            }

            if (!homed && this.ask_home) {
                this.ask_home = false;
                SvelteComponents.showDialog("HomeMachine", {
                    home: () => this.home()
                });
            }

            return {
                homed: homed,
                klass: klass
            };
        }
    }
};
