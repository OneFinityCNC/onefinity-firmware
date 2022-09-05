"use strict";

module.exports = {
    template: "#axis-control-template",
    props: [ "axes", "colors", "enabled", "adjust", "step" ],

    methods: {
        jog: function (axis, ring, direction) {
            const value = direction * this.value(ring);
            this.$dispatch(this.step ? "step" : "jog", this.axes[axis], value);
        },

        back2zero: function(axis0,axis1) {
            this.$dispatch("back2zero",this.axes[axis0],this.axes[axis1]);
        },

        release: function (axis) {
            if (!this.step) {
                this.$dispatch("jog", this.axes[axis], 0);
            }
        },

        value: function (ring) {
            const adjust = [ 0.01, 0.1, 1 ][this.adjust];
            if (this.step) {
                return adjust * [ 0.1, 1, 10, 100 ][ring];
            }
            return adjust * [ 0.1, 0.25, 0.5, 1 ][ring];
        },

        text: function (ring) {
            let value = this.value(ring) * (this.step ? 1 : 100);
            value = parseFloat(value.toFixed(3));
            return value + (this.step ? "" : "%");
        }
    }
};
