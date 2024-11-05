"use strict";

const api = require("./api");
const modbus = require("./modbus.js");
const merge = require("lodash.merge");

module.exports = {
  template: "#tool-view-template",
  props: ["config", "template", "state"],

  data: function () {
    return {
      address: 0,
      value: 0,
      toolList: [
        {
          id: "disabled",
          name: "Disabled",
        },
        {
          id: "router",
          type: "PWM Spindle",
          name: "Router (Makita, etc)",
        },
        {
          id: "laser",
          type: "PWM Spindle",
          name: "Laser (J Tech, etc)",
        },
        {
          id: "em60",
          name: "EM60",
        },
        {
          id: "redline-vfd",
          name: "Redline VFD",
        },
        {
          id: "pwm",
          name: "PWM Spindle",
        },
        {
          id: "unsupported-separator",
          name: "Unsupported Tools",
          disabled: true,
          unsupported: true,
        },
        {
          id: "huanyang-vfd",
          name: "Huanyang VFD",
          unsupported: true,
        },
        {
          id: "custom-modbus-vfd",
          name: "Custom Modbus VFD",
          unsupported: true,
        },
        {
          id: "ac-tech-vfd",
          name: "AC-Tech VFD",
          unsupported: true,
        },
        {
          id: "nowforever-vfd",
          name: "Nowforever VFD",
          unsupported: true,
        },
        {
          id: "delta-vfd",
          name: "Delta VFD015M21A (Beta)",
          unsupported: true,
        },
        {
          id: "yl600-vfd",
          name: "YL600, YL620, YL620-A VFD (Beta)",
          unsupported: true,
        },
        {
          id: "fr-d700-vfd",
          name: "FR-D700 (Beta)",
          unsupported: true,
        },
        {
          id: "sunfar-e300-vfd",
          name: "Sunfar E300 (Beta)",
          unsupported: true,
        },
        {
          id: "omron-mx2-vfd",
          name: "OMRON MX2",
          unsupported: true,
        },
        {
          id: "v70-vfd",
          name: "V70",
          unsupported: true,
        },
      ],
    };
  },

  components: {
    "modbus-reg": require("./modbus-reg.js"),
  },

  watch: {
    "state.mr": function () {
      this.value = this.state.mr;
    },
  },

  events: {
    "input-changed": function () {
      this.$dispatch("config-changed");

      return false;
    },
  },

  ready: function () {
    this.value = this.state.mr;
  },

  computed: {
    regs_tmpl: function () {
      return this.template["modbus-spindle"].regs;
    },

    tool_type: function () {
      return this.config.tool["tool-type"].toUpperCase();
    },

    selected_tool: function () {
      return this.config.tool["selected-tool"];
    },

    is_pwm_spindle: function () {
      return this.selected_tool == "pwm";
    },

    is_modbus: function () {
      switch (this.selected_tool) {
        case "disabled":
        case "laser":
        case "router":
        case "pwm":
          return false;

        default:
          return true;
      }
    },

    modbus_status: function () {
      return modbus.status_to_string(this.state.mx);
    },
  },

  methods: {
    change_selected_tool: function () {
      const selectedToolSettings = this.config["selected-tool-settings"] || {};
      const settings = selectedToolSettings[this.selected_tool] || {};
      this.config.tool = merge({}, this.config.tool, settings["tool"]);
      this.config["pwm-spindle"] = merge({}, this.config["pwm-spindle"], settings["pwm-spindle"]);
      this.config["modbus-spindle"] = merge({}, this.config["modbus-spindle"], settings["modbus-spindle"]);
      const tool = this.toolList.find(tool => tool.id == this.config.tool["selected-tool"]);
      this.config.tool["tool-type"] = tool.type || tool.name;
      this.$dispatch("config-changed");
    },

    show_tool_settings: function (key) {
      switch (true) {
        case key === "tool-type":
        case key === "selected-tool":
          return false;

        case this.selected_tool === "disabled":
          return false;

        case this.selected_tool === "laser":
        case this.selected_tool === "router":
          switch (key) {
            case "tool-enable-mode":
              return true;

            default:
              return false;
          }

        default:
          return true;
      }
    },

    get_reg_type: function (reg) {
      return this.regs_tmpl.template["reg-type"].values[this.state[`${reg}vt`]];
    },

    get_reg_addr: function (reg) {
      return this.state[`${reg}va`];
    },

    get_reg_value: function (reg) {
      return this.state[`${reg}vv`];
    },

    get_reg_fails: function (reg) {
      const fails = this.state[`${reg}vr`];
      return fails == 255 ? "Max" : fails;
    },

    show_modbus_field: function (key) {
      return key != "regs" && (key != "multi-write" || this.tool_type == "CUSTOM MODBUS VFD");
    },

    read: function (e) {
      e.preventDefault();
      api.put("modbus/read", { address: this.address });
    },

    write: function (e) {
      e.preventDefault();
      api.put("modbus/write", { address: this.address, value: this.value });
    },

    customize: function (e) {
      e.preventDefault();
      this.config.tool["tool-type"] = "Custom Modbus VFD";

      const regs = this.config["modbus-spindle"].regs;
      for (let i = 0; i < regs.length; i++) {
        const reg = this.regs_tmpl.index[i];
        regs[i]["reg-type"] = this.get_reg_type(reg);
        regs[i]["reg-addr"] = this.get_reg_addr(reg);
        regs[i]["reg-value"] = this.get_reg_value(reg);
      }

      this.$dispatch("config-changed");
    },

    clear: function (e) {
      e.preventDefault();
      this.config.tool["tool-type"] = "Custom Modbus VFD";

      const regs = this.config["modbus-spindle"].regs;
      for (let i = 0; i < regs.length; i++) {
        regs[i]["reg-type"] = "disabled";
        regs[i]["reg-addr"] = 0;
        regs[i]["reg-value"] = 0;
      }

      this.$dispatch("config-changed");
    },

    reset_failures: function (e) {
      e.preventDefault();
      const regs = this.config["modbus-spindle"].regs;
      for (let reg = 0; reg < regs.length; reg++) {
        this.$dispatch("send", `$${reg}vr=0`);
      }
    },
  },
};
