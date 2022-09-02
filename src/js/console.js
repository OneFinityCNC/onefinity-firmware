"use strict";

function _msg_equal(a, b) {
    return a.level == b.level
        && a.source == b.source
        && a.where == b.where
        &&a.msg == b.msg;
}

// Shared among all instances
const messages = [];

module.exports = {
    template: "#console-template",

    data: function () {
        return {
            messages
        };
    },

    events: {
        log: function (msg) {
            // There may be multiple instances of this module so ignore messages
            // that have already been processed.
            if (msg.logged) {
                return;
            }

            msg.logged = true;

            // Make sure we have a message level
            msg.level = msg.level || "info";

            // Add to message log and count and collapse repeats
            const repeat = messages.length && _msg_equal(msg, messages[0]);
            if (repeat) {
                messages[0].repeat++;
            } else {
                msg.repeat = msg.repeat || 1;
                messages.unshift(msg);
                while (256 < messages.length) {
                    messages.pop();
                }
            }
            msg.ts = Date.now();

            // Write message to browser console for debugging
            const text = JSON.stringify(msg);
            if (msg.level == "error" || msg.level == "critical") {
                console.error(text);
            } else if (msg.level == "warning") {
                console.warn(text);
            } else if (msg.level == "debug" && console.debug) {
                console.debug(text);
            } else {
                console.log(text);
            }

            // Event on errors
            if (msg.level == "error" || msg.level == "critical") {
                this.$dispatch("error", msg);
            }
        }
    },

    methods: {
        clear: function () {
            messages.splice(0, messages.length);
        },
    }
};
