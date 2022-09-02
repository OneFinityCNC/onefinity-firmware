"use strict";

const modbus = require("./modbus.js");

module.exports = {
    template: "#indicators-template",
    props: ["state"],

    computed: {
        modbus_status: function () {
            return modbus.status_to_string(this.state.mx);
        },

        sense_error: function () {
            let error = "";

            if (this.state.motor_voltage_sense_error) {
                error += "Motor voltage\n";
            }
            if (this.state.motor_current_sense_error) {
                error += "Motor current\n";
            }
            if (this.state.load1_sense_error) {
                error += "Load 1\n";
            }
            if (this.state.load2_sense_error) {
                error += "Load 2\n";
            }
            if (this.state.vdd_current_sense_error) {
                error += "Vdd current\n";
            }

            return error;
        }
    },

    methods: {
        is_motor_enabled: function (motor) {
            return typeof this.state[`${motor}me`] != "undefined" && this.state[`${motor}me`];
        },

        get_min_pin: function (motor) {
            switch (motor) {
                case 0: return 3;
                case 1: return 5;
                case 2: return 9;
                case 3: return 11;
            }
        },

        get_max_pin: function (motor) {
            switch (motor) {
                case 0: return 4;
                case 1: return 8;
                case 2: return 10;
                case 3: return 12;
            }
        },

        motor_fault_class: function (motor, bit) {
            if (typeof motor == "undefined") {
                const status = this.state["fa"];

                if (typeof status == "undefined") {
                    return "fa-question";
                }

                return `fa-thumbs-${status ? "down error" : "up success"}`;
            }

            const flags = this.state[`${motor}df`];

            if (typeof flags == "undefined") {
                return "fa-question";
            }

            return (flags & (1 << bit)) ? "fa-thumbs-down error" :
                "fa-thumbs-up success";
        },

        motor_reset: function (motor) {
            if (typeof motor == "undefined") {
                let cmd = "";
                for (let i = 0; i < 4; i++) {
                    cmd += `\\$${i}df=0\n`;
                }

                this.$dispatch("send", cmd);
            } else {
                this.$dispatch("send", `\\$${motor}df=0`);
            }
        }
    }
};
