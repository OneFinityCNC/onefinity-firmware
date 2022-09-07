"use strict";

module.exports = {
    replace: true,
    template: "#templated-input-template",
    props: [ "name", "model", "template" ],

    data: function() {
        return { view: "" };
    },

    computed: {
        metric: function() {
            return this.$root.display_units === "METRIC";
        },

        _view: function() {
            if (this.template.scale) {
                if (this.metric) {
                    return 1 * this.model.toFixed(3);
                }

                return 1 * (this.model / this.template.scale).toFixed(4);
            }

            return this.model;
        },

        units: function() {
            return (this.metric || !this.template.iunit)
                ? this.template.unit
                : this.template.iunit;
        },

        title: function() {
            let s = `Default :${this.template.default} ${(this.template.unit || "")}`;

            if (typeof this.template.help != "undefined") {
                s = `${this.template.help}\n${s}`;
            }

            return s;
        }
    },

    watch: {
        _view: function() {
            this.view = this._view;
        },

        view: function() {
            if (this.template.scale && !this.metric) {
                this.model = this.view * this.template.scale;
            } else {
                this.model = this.view;
            }
        }
    },

    ready: function() {
        this.view = this._view;
    },

    methods: {
        change: function() {
            this.$dispatch("input-changed");
        }
    }
};
