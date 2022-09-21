"use strict";

const api = require("./api");
const Preferences = require("./preferences");
const Sock = require("./sock");

SvelteComponents.createComponent("DialogHost",
    document.getElementById("svelte-dialog-host")
);

function parse_version(v) {
    const pattern = /^(\d+)\.(\d+)\.(\d+)(?:[-.]?(.*))?$/;
    const [ version, major, minor, patch, pre ] = v.trim().match(pattern) || [];

    return {
        version,
        major,
        minor,
        patch,
        pre
    };
}

function fixup_version_number(version) {
    const v = parse_version(version);

    version = `${v.major}.${v.minor}.${v.patch}`;
    if (v.pre) {
        const [ , prefix, num ] = v.pre.match(/([a-zA-Z])(\d+)/);

        let suffix;
        switch (prefix) {
            case "b":
                suffix = `beta.${num}`;
                break;

            case "a":
                suffix = `alpha.${num}`;
                break;

            default:
                suffix = v.pre;
        }

        version = `${version}-${suffix}`;
    }

    return version;
}

function is_object(o) {
    return o !== null && typeof o == "object";
}

function is_array(o) {
    return Array.isArray(o);
}

function update_array(dst, src) {
    while (dst.length) {
        dst.pop();
    }

    for (let i = 0; i < src.length; i++) {
        Vue.set(dst, i, src[i]);
    }
}

function hasOwnProperty(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function update_object(dst, src, remove) {
    let props, index, key, value;

    if (remove) {
        props = Object.getOwnPropertyNames(dst);

        for (index in props) {
            key = props[index];
            if (!hasOwnProperty(src, key)) {
                Vue.delete(dst, key);
            }
        }
    }

    props = Object.getOwnPropertyNames(src);
    for (index in props) {
        key = props[index];
        value = src[key];

        if (is_array(value) && hasOwnProperty(dst, key) && is_array(dst[key])) {
            update_array(dst[key], value);
        } else if (is_object(value) && hasOwnProperty(dst, key) && is_object(dst[key])) {
            update_object(dst[key], value, remove);
        } else {
            Vue.set(dst, key, value);
        }
    }
}

module.exports = new Vue({
    el: "body",

    data: function() {
        return {
            status: "connecting",
            currentView: "loading",
            display_units: Preferences.getString("display_units", "METRIC"),
            index: -1,
            modified: false,
            template: require("../resources/config-template.json"),
            config: {
                settings: { units: "METRIC" },
                motors: [ {}, {}, {}, {} ],
                version: "<loading>",
                full_version: "<loading>",
            },
            state: {
                messages: [],
            },
            video_size: Preferences.getString("video-size", "small"),
            crosshair: Preferences.getBool("crosshair", false),
            errorTimeout: 30,
            errorTimeoutStart: 0,
            errorShow: false,
            errorMessage: "",
            newFirmwareVersion: "",
            newFirmwareAvailable: false
        };
    },

    components: {
        estop: { template: "#estop-template" },
        "loading-view": { template: "<h1>Loading...</h1>" },
        "control-view": require("./control-view"),
        "settings-view": require("./settings-view"),
        "motor-view": require("./motor-view"),
        "tool-view": require("./tool-view"),
        "io-view": require("./io-view"),
        "admin-general-view": require("./admin-general-view"),
        "admin-network-view": require("./admin-network-view"),
        "help-view": require("./help-view"),
        "cheat-sheet-view": {
            template: "#cheat-sheet-view-template",
            data: function() {
                return {
                    showUnimplemented: false
                };
            },
        },
    },

    watch: {
        display_units: function(value) {
            Preferences.setString("display_units", value);
            SvelteComponents.setDisplayUnits(value);
        },
    },

    events: {
        "new-firmware-available": function() {
            this.newFirmwareAvailable = true;
            this.newFirmwareVersion = SvelteComponents.getLatestFirmwareVersion();
        },

        "firmware-update": function() {
            this.updatingFirmware = true;
        },

        "close-menu": function() {
            document.getElementById("layout").classList.remove("active");
            document.getElementById("menu").classList.remove("active");
            document.getElementById("menuLink").classList.remove("active");
        },

        "config-changed": function() {
            this.modified = true;
        },

        send: function(msg) {
            if (this.status == "connected") {
                this.sock.send(msg);
            }
        },

        update: function() {
            this.update();
        },

        error: function(msg) {
            // Honor user error blocking
            if (Date.now() - this.errorTimeoutStart < this.errorTimeout * 1000) {
                return;
            }

            // Wait at least 1 sec to pop up repeated errors
            if (1 < msg.repeat && Date.now() - msg.ts < 1000) {
                return;
            }

            // Popup error dialog
            this.errorShow = true;
            this.errorMessage = msg.msg;
        },
    },

    computed: {
        popupMessages: function() {
            const msgs = [];

            for (let i = 0; i < this.state.messages.length; i++) {
                const text = this.state.messages[i].text;
                if (!/^#/.test(text)) {
                    msgs.push(text);
                }
            }

            return msgs;
        },
    },

    ready: function() {
        window.onhashchange = () => this.parse_hash();
        this.connect();

        SvelteComponents.registerControllerMethods({
            dispatch: (...args) => this.$dispatch(...args)
        });
    },

    methods: {
        toggle_menu: function(e) {
            e.preventDefault();

            document.getElementById("layout").classList.toggle("active");
            document.getElementById("menu").classList.toggle("active");
            document.getElementById("menuLink").classList.toggle("active");
        },

        block_error_dialog: function() {
            this.errorTimeoutStart = Date.now();
            this.errorShow = false;
        },

        toggle_video: function() {
            if (this.video_size == "small") {
                this.video_size = "large";
            } else if (this.video_size == "large") {
                this.video_size = "small";
            }

            Preferences.setString("video-size", this.video_size);
        },

        toggle_crosshair: function(e) {
            e.preventDefault();
            this.crosshair = !this.crosshair;
            Preferences.setBool("crosshair", this.crosshair);
        },

        estop: function() {
            if (this.state.xx == "ESTOPPED") {
                api.put("clear");
            } else {
                api.put("estop");
            }
        },

        showShutdownDialog: function() {
            SvelteComponents.showDialog("Shutdown");
        },

        update: async function() {
            const config = await api.get("config/load");

            update_object(this.config, config, true);
            this.config.full_version = fixup_version_number(this.config.full_version);
            this.parse_hash();

            SvelteComponents.handleConfigUpdate(this.config);
            SvelteComponents.checkFirmwareUpgrades();
        },

        connect: function() {
            this.sock = new Sock(`//${location.host}/sockjs`);

            this.sock.onmessage = (e) => {
                if (typeof e.data != "object") {
                    return;
                }

                if (e.data.log && e.data.log.msg !== "Switch not found") {
                    this.$broadcast("log", e.data.log);

                    if (Object.keys(e.data).length === 1) {
                        // If there's only log data, we're done
                        return;
                    }
                }

                // Check for session ID change on controller
                if (e.data.sid) {
                    if (this.sid && this.sid !== e.data.sid) {
                        Preferences.remove("client-id");
                        location.reload();
                    }

                    this.sid = e.data.sid;
                }

                update_object(this.state, e.data, false);

                SvelteComponents.handleControllerStateUpdate(this.state);

                delete this.state.log;
            };

            this.sock.onopen = () => {
                this.status = "connected";
                this.update();
            };

            this.sock.onclose = () => {
                this.status = "disconnected";
            };
        },

        parse_hash: function() {
            const hash = location.hash.substr(1);

            if (!hash.trim().length) {
                location.hash = "control";
                return;
            }

            const parts = hash.split(":");

            if (parts.length == 2) {
                this.index = parts[1];
            }

            this.currentView = parts[0];
        },

        save: async function() {
            const selected_tool = this.config.tool["selected-tool"];
            const saveModbus =
                selected_tool !== "pwm" &&
                selected_tool !== "laser" &&
                selected_tool !== "router";
            const settings = {
                ["tool"]: { ...this.config.tool },
                ["pwm-spindle"]: { ...this.config["pwm-spindle"] },
                ["modbus-spindle"]: saveModbus
                    ? { ...this.config["modbus-spindle"] }
                    : undefined,
            };
            delete settings.tool["tool-type"];

            this.config["selected-tool-settings"][selected_tool] = settings;

            try {
                await api.put("config/save", this.config);
                this.modified = false;
            } catch (error) {
                console.error("Save failed:", error);
                alert("Save failed");
            }
        },

        close_messages: function(action) {
            if (action == "stop") {
                api.put("stop");
            }

            if (action == "continue") {
                api.put("unpause");
            }

            // Acknowledge messages
            if (this.state.messages.length) {
                const id = this.state.messages.slice(-1)[0].id;
                api.put(`message/${id}/ack`);
            }
        },
    },
});
