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
      newGcode: ["", "", "", "", "", "", "", ""],
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
    updateNewGcode(event) {
      this.newGcode[this.tab-1] = event.target.value;
    },
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    load: function () {
      const file_time = this.state.selected_time;
      const file = this.state.selected;
      this.$broadcast("gcode-load", file);
      this.$broadcast("gcode-line", this.state.line);
      this.newGcode[this.tab-1] = "";
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
    saveMacros: async function () {
      var macrosName = document.getElementById(
        `macros-name-${this.tab-1}`
      ).value;
      var macrosColor = document.getElementById(
        `macros-color-${this.tab-1}`
      ).value;

      if(this.state.selected =='default'){
        const file = this.newGcode[this.tab-1];
        SvelteComponents.showDialog("Upload", {
          file,
          onComplete: () => {
            this.last_file_time = macrosName;
            this.$broadcast("gcode-reload", file.name);
          },
        });
      }

      console.log(this.tab-1);

      this.config.macros[this.tab-1].name = macrosName;
      console.log(this.config.macros[this.tab-1].name);
      this.config.macros[this.tab-1].color = macrosColor;
      this.config.macros[this.tab-1].gcode_file_name = file.name;
      this.config.macros[this.tab-1].gcode_file_time =
        this.state.selected_time;
      console.log(this.config.macros);
      this.cancelMacros(this.tab-1);
      this.confirmSave = false;
      try {
        await api.put("config/save", this.config);
        console.log("Successfully saved");
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    cancelMacros: function () {
      document.getElementById(`macros-name-${this.tab-1}`).value = "";
      document.getElementById(`macros-color-${this.tab-1}`).value = "#ffffff";
      document.getElementById(`gcodeSelect-${this.tab-1}`).value = "default";
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
          name: "Perk",
          color: "#e6e6e6",
          gcode_file_name: " ",
          gcode_file_time: 0,
        },
        {
          name: "Spindle Warmup",
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
