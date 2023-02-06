"use strict";

module.exports = {
    template: "#message-template",

    props: {
        show: {
            type: Boolean,
            required: true,
            twoWay: true
        },

        class: {
            type: String,
            required: false,
            twoWay: false
        }
    }
};
