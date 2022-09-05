"use strict";

module.exports = {
    template: "#io-view-template",
    props: [ "config", "template", "state" ],

    events: {
        "input-changed": function() {
            this.$dispatch("config-changed");
            return false;
        }
    }
};
