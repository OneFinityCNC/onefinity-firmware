"use strict";

const api = require("./api");
const utils = require("./utils");

module.exports = {
  template: "#macros-template",
  props: ["config", "template", "state"],

  data: function () {
    return {
      tab: "1",
      confirmReset: false,
      confirmSave: false,
    };
  },
  components: {
    "gcode-viewer": require("./gcode-viewer"),
  },
  computed: {
    mach_state: function () {
      const cycle = this.state.cycle;
      const state = this.state.xx;

      if (state != "ESTOPPED" && (cycle == "jogging" || cycle == "homing")) {
        return cycle.toUpperCase();
      }

      return state || "";
    },
    is_ready: function () {
      return this.mach_state == "READY";
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    load: function () {
      const file_time = this.state.selected_time;
      const file = this.state.selected;
      this.$broadcast("gcode-load", file);
      this.$broadcast("gcode-line", this.state.line);
    },
    upload: function (e) {
      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }

      const file = files[0];
      const extension = file.name.split(".").pop();
      switch (extension.toLowerCase()) {
        case "nc":
        case "ngc":
        case "gcode":
        case "gc":
          break;

        default:
          alert(`Unsupported file type: ${extension}`);
          return;
      }

      SvelteComponents.showDialog("Upload", {
        file,
        onComplete: () => {
          this.last_file_time = undefined; // Force reload
          this.$broadcast("gcode-reload", file.name);
        },
      });
    },
    saveMacros: async function (id) {
      var macrosName = document.getElementById(`macros-name-${id}`).value;
      var macrosColor = document.getElementById(`macros-color-${id}`).value;

      console.log(this.tab);

      this.config.macros[id].name = macrosName;
      this.config.macros[id].color = macrosColor;
      this.config.macros[id].gcode_file_name = this.state.selected;
      this.config.macros[id].gcode_file_time = this.state.selected_time;
      console.log(this.config.macros);
      this.cancelMacros(id);
      try {
        await api.put("config/save", this.config);
        console.log("Successfully saved");
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    cancelMacros: function (id) {
      document.getElementById(`macros-name-${id}`).value = "";
      document.getElementById(`macros-color-${id}`).value = "#ffffff";
      document.getElementById(`gcodeSelect-${id}`).value = "default";
      this.$broadcast("gcode-clear");
    },
    resetConfig: async function () {
      this.config.macros = [
        {
          name: "FireLaser",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Home",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Park",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Spindle WarmUp",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Spindle ON",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Spindle OFF",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Vacuum ON",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Vacuum OFF",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
      ];
      this.confirmReset = false;
      try {
        await api.put("config/save", this.config);
        console.log("Successfully flushed");
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
  },
};
