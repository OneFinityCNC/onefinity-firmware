"use strict";

module.exports = {
    replace: true,
    template: '{{text}}<span class="unit">{{metric ? unit : iunit}}</span>',
    props: [ "value", "precision", "unit", "iunit", "scale" ],

    computed: {
        metric: {
            cache: false,
            get: function() {
                return this.$root.display_units === "METRIC";
            }
        },

        text: function() {
            let value = this.value;
            if (typeof value == "undefined") {
                return "";
            }

            if (!this.metric) {
                value /= this.scale;
            }

            return (1 * value.toFixed(this.precision)).toLocaleString();
        }
    },

    ready: function() {
        if (typeof this.precision == "undefined") {
            this.precision = 0;
        }

        if (typeof this.unit == "undefined") {
            this.unit = "mm";
        }

        if (typeof this.iunit == "undefined") {
            this.iunit = "in";
        }

        if (typeof this.scale == "undefined") {
            this.scale = 25.4;
        }
    }
};
