"use strict";

module.exports = {
    replace: true,
    template: "#modbus-reg-view-template",
    props: [ "index", "model", "template", "enable" ],

    computed: {
        has_user_value: function () {
            const type = this.model["reg-type"];
            return type.indexOf("write") != -1 || type.indexOf("fixed") != -1;
        }
    },

    methods: {
        change: function () {
            this.$dispatch("input-changed");
        }
    }
};
