"use strict";

const Preferences = require("./preferences");
const { v4: uuidv4 } = require("uuid");

window.onload = function() {
    let id = Preferences.getString("client-id", "");
    if (!id) {
        id = uuidv4();
        Preferences.setString("client-id", id);
    }
    document.cookie = `client-id=${id}`;

    // Register global components
    Vue.component("templated-input", require("./templated-input"));
    Vue.component("message", require("./message"));
    Vue.component("indicators", require("./indicators"));
    Vue.component("io-indicator", require("./io-indicator"));
    Vue.component("console", require("./console"));
    Vue.component("unit-value", require("./unit-value"));

    Vue.filter("number", function(value) {
        if (isNaN(value)) {
            return "NaN";
        }

        return value.toLocaleString();
    });

    Vue.filter("percent", function(value, precision) {
        if (typeof value == "undefined") {
            return "";
        }

        if (typeof precision == "undefined") {
            precision = 2;
        }

        return `${(value * 100.0).toFixed(precision)}%`;
    });

    Vue.filter("non_zero_percent", function(value, precision) {
        if (!value) {
            return "";
        }

        if (typeof precision == "undefined") {
            precision = 2;
        }

        return `${(value * 100.0).toFixed(precision)}%`;
    });

    Vue.filter("fixed", function(value, precision) {
        if (typeof value == "undefined") {
            return "0";
        }

        return parseFloat(value).toFixed(precision);
    });

    Vue.filter("upper", function(value) {
        if (typeof value == "undefined") {
            return "";
        }

        return value.toUpperCase();
    });

    Vue.filter("time", function(value, precision) {
        if (isNaN(value)) {
            return "";
        }

        if (isNaN(precision)) {
            precision = 0;
        }

        const MIN = 60;
        const HR = MIN * 60;
        const DAY = HR * 24;
        const parts = [];

        if (DAY <= value) {
            parts.push(Math.floor(value / DAY));
            value %= DAY;
        }

        if (HR <= value) {
            parts.push(Math.floor(value / HR));
            value %= HR;
        }

        if (MIN <= value) {
            parts.push(Math.floor(value / MIN));
            value %= MIN;
        } else {
            parts.push(0);
        }

        parts.push(value);

        for (let i = 0; i < parts.length; i++) {
            parts[i] = parts[i].toFixed(i == parts.length - 1 ? precision : 0);
            if (i && parts[i] < 10) {
                parts[i] = `0${parts[i]}`;
            }
        }

        return parts.join(":");
    });

    // Vue app
    require("./app");
};
