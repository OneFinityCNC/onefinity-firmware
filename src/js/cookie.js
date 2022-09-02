"use strict";

module.exports = function (prefix) {
    if (typeof prefix == "undefined") {
        prefix = "";
    }

    const cookie = {
        get: function (name, defaultValue) {
            const decodedCookie = decodeURIComponent(document.cookie);
            const ca = decodedCookie.split(";");
            name = `${prefix + name}=`;

            for (let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) == " ") {
                    c = c.substring(1);
                }
                if (!c.indexOf(name)) {
                    return c.substring(name.length, c.length);
                }
            }

            return defaultValue;
        },

        set: function (name, value, days) {
            let offset = 2147483647; // Max value
            if (typeof days != "undefined") {
                offset = days * 24 * 60 * 60 * 1000;
            }

            const d = new Date();
            d.setTime(d.getTime() + offset);
            const expires = `expires=${d.toUTCString()}`;
            document.cookie = `${prefix}${name}=${value};${expires};path=/`;
        },

        set_bool: function (name, value) {
            cookie.set(name, value ? "true" : "false");
        },

        get_bool: function (name, defaultValue) {
            return cookie.get(name, defaultValue ? "true" : "false") == "true";
        }
    };

    return cookie;
};
