"use strict";

module.exports = {
    template: "#io-indicator-template",
    props: ["name", "state"],

    computed: {
        klass: function () {
            switch (this.name) {
                case "min-switch-0": return this.get_motor_min_class(0);
                case "min-switch-1": return this.get_motor_min_class(1);
                case "min-switch-2": return this.get_motor_min_class(2);
                case "min-switch-3": return this.get_motor_min_class(3);
                case "max-switch-0": return this.get_motor_max_class(0);
                case "max-switch-1": return this.get_motor_max_class(1);
                case "max-switch-2": return this.get_motor_max_class(2);
                case "max-switch-3": return this.get_motor_max_class(3);
                case "estop": return this.get_input_class("ew", "et");
                case "probe": return this.get_input_class("pw", "pt");
                case "load-1": return this.get_output_class("1");
                case "load-2": return this.get_output_class("2");
                case "fault": return this.get_output_class("f");
                case "tool-enable-mode": return this.get_output_class("e");
                case "tool-direction-mode": return this.get_output_class("d");
            }
        },

        tooltip: function () {
            switch (this.name) {
                case "min-switch-0": return this.get_motor_min_tooltip(0);
                case "min-switch-1": return this.get_motor_min_tooltip(1);
                case "min-switch-2": return this.get_motor_min_tooltip(2);
                case "min-switch-3": return this.get_motor_min_tooltip(3);
                case "max-switch-0": return this.get_motor_max_tooltip(0);
                case "max-switch-1": return this.get_motor_max_tooltip(1);
                case "max-switch-2": return this.get_motor_max_tooltip(2);
                case "max-switch-3": return this.get_motor_max_tooltip(3);
                case "estop": return this.get_input_tooltip("ew", "et");
                case "probe": return this.get_input_tooltip("pw", "pt");
                case "load-1": return this.get_output_tooltip("1");
                case "load-2": return this.get_output_tooltip("2");
                case "fault": return this.get_output_tooltip("f");
                case "tool-direction-mode": return this.get_output_tooltip("d");
                case "tool-enable-mode": return this.get_output_tooltip("e");
            }
        }
    },

    methods: {
        get_io_state_class: function (active, state) {
            if (typeof active == "undefined" || typeof state == "undefined") {
                return "fa-exclamation-triangle warn";
            }

            if (state == 2) {
                return "fa-circle-o";
            }

            const icon = state ? "fa-plus-circle" : "fa-minus-circle";
            return `${icon} ${active ? "active" : "inactive"}`;
        },

        get_input_active: function (stateCode, typeCode) {
            const type = this.state[typeCode];
            const state = this.state[stateCode];

            if (type == 1) {
                return !state; // Normally open
            } else if (type == 2) {
                return state; // Normally closed
            }

            return false;
        },

        get_input_class: function (stateCode, typeCode) {
            return this.get_io_state_class(this.get_input_active(stateCode, typeCode), this.state[stateCode]);
        },

        get_output_class: function (output) {
            return this.get_io_state_class(this.state[`${output}oa`], this.state[`${output}os`]);
        },

        get_motor_min_class: function (motor) {
            return this.get_input_class(`${motor}lw`, `${motor}ls`);
        },

        get_motor_max_class: function (motor) {
            return this.get_input_class(`${motor}xw`, `${motor}xs`);
        },

        get_tooltip: function (mode, active, state) {
            if (typeof mode == "undefined" || typeof active == "undefined" || typeof state == "undefined") {
                return "Invalid";
            }

            if (state == 0) {
                state = "Lo/Gnd";
            } else if (state == 1) {
                state = "Hi/+3.3v";
            } else if (state == 2) {
                state = "Tristated";
            } else {
                return "Invalid";
            }

            return `Mode: ${mode}\nActive: ${active ? "True" : "False"}\nLevel: ${state}`;
        },

        get_input_tooltip: function (stateCode, typeCode) {
            let type = this.state[typeCode];
            if (type == 0) {
                return "Disabled";
            } else if (type == 1) {
                type = "Normally open";
            } else if (type == 2) {
                type = "Normally closed";
            }

            const active = this.get_input_active(stateCode, typeCode);
            const state = this.state[stateCode];

            return this.get_tooltip(type, active, state);
        },

        get_output_tooltip: function (output) {
            let mode = this.state[`${output}om`];

            switch (mode) {
                case 0: return "Disabled";
                case 1: mode = "Lo/Hi"; break;
                case 2: mode = "Hi/Lo"; break;
                case 3: mode = "Tri/Lo"; break;
                case 4: mode = "Tri/Hi"; break;
                case 5: mode = "Lo/Tri"; break;
                case 6: mode = "Hi/Tri"; break;
                default:
                    mode = undefined;
            }

            const active = this.state[`${output}oa`];
            const state = this.state[`${output}os`];

            return this.get_tooltip(mode, active, state);
        },

        get_motor_min_tooltip: function (motor) {
            return this.get_input_tooltip(`${motor}lw`, `${motor}ls`);
        },

        get_motor_max_tooltip: function (motor) {
            return this.get_input_tooltip(`${motor}xw`, `${motor}xs`);
        }
    }
};
