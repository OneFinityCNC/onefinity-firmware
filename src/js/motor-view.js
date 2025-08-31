"use strict";

module.exports = {
    template: "#motor-view-template",
    props: [ "index", "config", "template", "state" ],

    computed: {
        metric: function() {
            return this.$root.display_units === "METRIC";
        },

        is_slave: function() {
            for (let i = 0; i < this.index; i++) {
                if (this.motor.axis == this.config.motors[i].axis) {
                    return true;
                }
            }

            return false;
        },

        motor: function() {
            return this.config.motors[this.index];
        },

        invalidMaxVelocity: function() {
            return this.maxMaxVelocity < this.motor["max-velocity"];
        },

        maxMaxVelocity: function() {
            return 1 * (15 * this.umPerStep / this.motor["microsteps"]).toFixed(3);
        },

        ustepPerSec: function() {
            return this.rpm * this.stepsPerRev * this.motor["microsteps"] / 60;
        },

        rpm: function() {
            return 1000 * this.motor["max-velocity"] / this.motor["travel-per-rev"];
        },

        gForce: function() {
            return this.motor["max-accel"] * 0.0283254504;
        },

        gForcePerMin: function() {
            return this.motor["max-jerk"] * 0.0283254504;
        },

        stepsPerRev: function() {
            return 360 / this.motor["step-angle"];
        },

        umPerStep: function() {
            return this.motor["travel-per-rev"] * this.motor["step-angle"] / 0.36;
        },

        milPerStep: function() {
            return this.umPerStep / 25.4;
        },

        invalidStallVelocity: function() {
            if (!this.motor["homing-mode"].startsWith("stall-")) {
                return false;
            }

            return this.maxStallVelocity < this.motor["search-velocity"];
        },

        stallRPM: function() {
            const v = this.motor["search-velocity"];
            return 1000 * v / this.motor["travel-per-rev"];
        },

        maxStallVelocity: function() {
            const maxRate = 900000 / this.motor["stall-sample-time"];
            const ustep = this.motor["stall-microstep"];
            const angle = this.motor["step-angle"];
            const travel = this.motor["travel-per-rev"];
            const maxStall = maxRate * 60 / 360 / 1000 * angle / ustep * travel;

            return 1 * maxStall.toFixed(3);
        },

        stallUStepPerSec: function() {
            const ustep = this.motor["stall-microstep"];
            return this.stallRPM * this.stepsPerRev * ustep / 60;
        },

        current_axis: function() {
            return this.state[this.index + 'an'];
        },

        current_max_velocity: function() {
            return this.state[this.index + 'vm'];
        },

        current_max_soft_limit: function() {
            return this.state[this.index + 'tm'];
        },

        current_min_soft_limit: function() {
            return this.state[this.index + 'tn'];
        },
        current_max_accel: function() {
            return this.state[this.index + 'am'];
        },
        current_max_jerk: function() {
            return this.state[this.index + 'jm'];
        },
        current_step_angle: function() {
            return this.state[this.index + 'sa'];
        },
        current_travel_per_rev: function() {
            return this.state[this.index + 'tr'];
        },
        current_microsteps: function() {
            return this.state[this.index + 'mi'];
        }
    },

    attached: function() {
        // Sync all state values with motor config when component mounts
        // This ensures UI shows correct values even if rotary was toggled on another page
        this.syncStateToConfig();
    },

    watch: {
        // Watch for state changes to handle late-arriving websocket data
        state: {
            handler: function() {
                // Re-sync when state updates (e.g., when websocket data arrives)
                this.syncStateToConfig();
            },
            deep: true
        },

        current_axis(new_value) {
            const motor_axes = ["X", "Y", "Z", "A", "B", "C"] 
            if(motor_axes[new_value] != this.motor['axis']){
                this.motor['axis'] = motor_axes[new_value];
            }
        },

        current_max_velocity(new_value) {
            if(new_value != this.motor['max-velocity']) {
                this.motor['max-velocity'] = new_value;
            }
        },

        current_max_soft_limit(new_value) {
            if(new_value != this.motor['max-soft-limit']) {
                this.motor['max-soft-limit'] = new_value;
            }
        },

        current_min_soft_limit(new_value) {
            if(new_value != this.motor['min-soft-limit']) {
                this.motor['min-soft-limit'] = new_value;
            }
        },

        current_max_accel(new_value) {
            if(new_value != this.motor['max-accel']) {
                this.motor['max-accel'] = new_value;
            }
        },
        
        current_max_jerk(new_value) {
            if(new_value != this.motor['max-jerk']) {
                this.motor['max-jerk'] = new_value;
            }
        },
        
        current_step_angle(new_value) {
            if(new_value != this.motor['step-angle']) {
                this.motor['step-angle'] = new_value;
            }
        },
        
        current_travel_per_rev(new_value) {
            if(new_value != this.motor['travel-per-rev']) {
                this.motor['travel-per-rev'] = new_value;
            }
        },
        
        current_microsteps(new_value) {
            if(new_value != this.motor['microsteps']) {
                this.motor['microsteps'] = new_value;
            }
        }
    },

    events: {
        "input-changed": function() {
            Vue.nextTick(function() {
                // Limit max-velocity
                if (this.invalidMaxVelocity) {
                    this.$set('motor["max-velocity"]', this.maxMaxVelocity);
                }

                //Limit stall-velocity
                if (this.invalidStallVelocity) {
                    this.$set('motor["search-velocity"]', this.maxStallVelocity);
                }

                this.$dispatch("config-changed");
            }.bind(this));

            return false;
        }
    },

    methods: {
        show: function(name, templ) {
            if (templ.hmodes == undefined) {
                return true;
            }

            return templ.hmodes.indexOf(this.motor["homing-mode"]) != -1;
        },

        syncStateToConfig: function() {
            // Force sync all state values to motor config
            // This ensures the UI reflects the current state even if changes happened while component was unmounted
            
            const motor_axes = ["X", "Y", "Z", "A", "B", "C"];
            
            // Define mapping between state properties and motor config properties
            const stateToMotorMapping = [
                {
                    stateKey: 'current_axis',
                    motorKey: 'axis',
                    transform: (value) => motor_axes[value]
                },
                {
                    stateKey: 'current_max_velocity',
                    motorKey: 'max-velocity'
                },
                {
                    stateKey: 'current_max_soft_limit',
                    motorKey: 'max-soft-limit'
                },
                {
                    stateKey: 'current_min_soft_limit',
                    motorKey: 'min-soft-limit'
                },
                {
                    stateKey: 'current_max_accel',
                    motorKey: 'max-accel'
                },
                {
                    stateKey: 'current_max_jerk',
                    motorKey: 'max-jerk'
                },
                {
                    stateKey: 'current_step_angle',
                    motorKey: 'step-angle'
                },
                {
                    stateKey: 'current_travel_per_rev',
                    motorKey: 'travel-per-rev'
                },
                {
                    stateKey: 'current_microsteps',
                    motorKey: 'microsteps'
                }
            ];
            
            // Sync all properties using the mapping
            stateToMotorMapping.forEach(({ stateKey, motorKey, transform }) => {
                const stateValue = this[stateKey];
                
                if (stateValue === undefined) {
                    return; // Skip if state value is not defined
                }
                
                const transformedValue = transform ? transform(stateValue) : stateValue;
                const currentMotorValue = this.motor[motorKey];
                
                if (transformedValue !== currentMotorValue) {
                    this.motor[motorKey] = transformedValue;
                }
            });
        }
    }
};
