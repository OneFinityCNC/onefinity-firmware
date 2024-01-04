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
    };
  },
  components: {
    "axis-control": require("./axis-control"),
    "path-viewer": require("./path-viewer"),
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

      this.config.macros[id].name = macrosName;
      this.config.macros[id].color = macrosColor;
      this.config.macros[id].gcode_file_name = this.state.selected;
      this.config.macros[id].gcode_file_time = this.state.selected_time;
      console.log(this.config.macros);
      this.cancelMacros();
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
      this.$broadcast("gcode-clear");
    },
    resetConfig: async function () {
      this.config.macros = [
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: " ",
          color: "#efefef",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
      ];
      this.confirmReset=false;
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
