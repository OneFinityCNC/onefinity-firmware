"use strict";

const api = require("./api");
const cookie = require("./cookie")("bbctrl-");
const Sock = require("./sock");
const semverLt = require("semver/functions/lt");

if (document.getElementById("svelte-dialog-host") != undefined) {
  SvelteComponents.createComponent(
    "DialogHost",
    document.getElementById("svelte-dialog-host")
  );
}
if (document.getElementById("adminViewSvelte") != undefined) {
  SvelteComponents.createComponent("AdminNetworkView");
}

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

        const suffix = prefix === "b"
            ? `beta.${num}`
            : v.pre;

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
          display_units: localStorage.getItem("display_units") || "METRIC",
          index: -1,
          modified: false,
          template: require("../resources/config-template.json"),
          config: {
            settings: { units: "METRIC" },
            motors: [{}, {}, {}, {}],
            version: "<loading>",
            full_version: "<loading>",
            ip: "<>",
            wifiName: "not connected",
            macros:[{},{},{},{},{},{},{},{}],
            macros_list:[],
            non_macros_list:[]
          },
          state: {
            messages: [],
          },
          video_size: cookie.get("video-size", "small"),
          crosshair: cookie.get("crosshair", "false") != "false",
          errorTimeout: 30,
          errorTimeoutStart: 0,
          errorShow: false,
          errorMessage: "",
          confirmUpgrade: false,
          confirmUpload: false,
          firmwareUpgrading: false,
          checkedUpgrade: false,
          firmwareName: "",
          latestVersion: "",
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
        "macros-view": require('./macros'),
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
            localStorage.setItem("display_units", value);
            SvelteComponents.setDisplayUnits(value);
        },
    },

    events: {
        "config-changed": function() {
            this.modified = true;
        },

        send: function(msg) {
            if (this.status == "connected") {
                this.sock.send(msg);
            }
        },

        connected: function() {
            this.update();
        },

        update: function() {
            this.update();
        },

        check: async function() {
            try {
                const response = await fetch("https://raw.githubusercontent.com/OneFinityCNC/onefinity-release/master/latest.txt", {
                    cache: "no-cache"
                });

                this.latestVersion = (await response.text()).trim();
            } catch (err) {
                this.latestVersion = "";
            }
        },

        upgrade: function() {
            this.confirmUpgrade = true;
        },

        upload: function(firmware) {
            this.firmware = firmware;
            this.firmwareName = firmware.name;
            this.confirmUpload = true;
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

        is_rotary_active: function() {
            if(this.state["2an"] == 3) return true;
            return false;
        },

        enable_rotary: function() {
            if(this.state["2an"] == 1 || this.state["2an"] == 3) return true;
            return false;
        }
    },

    ready: function() {
        window.onhashchange = () => this.parse_hash();
        this.connect();

        SvelteComponents.registerControllerMethods({
            dispatch: (...args) => this.$dispatch(...args)
        });
    },

    methods: {
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
            cookie.set("video-size", this.video_size);
        },

        toggle_crosshair: function(e) {
            e.preventDefault();
            this.crosshair = !this.crosshair;
            cookie.set("crosshair", this.crosshair);
        },

        estop: function() {
            if (this.state.xx == "ESTOPPED") {
                api.put("clear");
            } else {
                api.put("estop");
            }
        },

        upgrade_confirmed: async function() {
            this.confirmUpgrade = false;

            try {
                await api.put("upgrade");
                this.firmwareUpgrading = true;
            } catch (error) {
                console.error("Error during upgrade:", error);
                alert("Error during upgrade");
            }
        },

        upload_confirmed: async function() {
            this.confirmUpload = false;

            const form = new FormData();
            form.append("firmware", this.firmware);

            try {
                await api.put("firmware/update", form);
                this.firmwareUpgrading = true;
            } catch (error) {
                console.error("Firmware update failed:", error);
                alert("Firmware update failed");
            }
        },

        show_upgrade: function() {
            if (!this.latestVersion) {
                return false;
            }

            return semverLt(this.config.full_version, this.latestVersion);
        },

        showSwitchRotaryModeDialog: function(){
            SvelteComponents.showDialog("SwitchRotary", {
                isActive: !this.is_rotary_active,
                switchMode: (isActive) => this.toggle_rotary(isActive)
            });
        },
 
        toggle_rotary: async function(isActive) {
            try {
                await api.put("rotary", {status: isActive});
              } catch (error) {
                console.error(error);
                alert("Error occured");
              }
        },
 
        showShutdownDialog: function() {
            SvelteComponents.showDialog("Shutdown");
        },

        update: async function() {
            const config = await api.get("config/load");
            const wifi = await api.get("wifi");
            update_object(this.config, config, true);
            this.config.full_version = fixup_version_number(this.config.full_version);
            this.config.ip = wifi.ipAddresses;
            this.config.wifiName = wifi.wifi;
            this.parse_hash();

            if (!this.checkedUpgrade) {
                this.checkedUpgrade = true;

                const check = this.config.admin["auto-check-upgrade"];
                if (typeof check == "undefined" || check) {
                    this.$emit("check");
                }
            }

            SvelteComponents.handleConfigUpdate(this.config);
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
                if ("sid" in e.data) {
                    if (typeof this.sid == "undefined") {
                        this.sid = e.data.sid;
                    } else if (this.sid != e.data.sid) {
                        if (this.hostname && location.hostname !== "localhost") {
                            location.hostname = this.hostname;
                        }

                        location.reload();
                    }
                }

                update_object(this.state, e.data, false);

                SvelteComponents.handleControllerStateUpdate(this.state);

                delete this.state.log;

                this.$broadcast("update");
            };

            this.sock.onopen = () => {
                this.status = "connected";
                this.$emit(this.status);
                this.$broadcast(this.status);
            };

            this.sock.onclose = () => {
                this.status = "disconnected";
                this.$emit(this.status);
                this.$broadcast(this.status);
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
            this.display_units = this.config.settings["units"];
            
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
