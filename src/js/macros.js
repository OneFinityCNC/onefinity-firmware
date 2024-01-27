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
      deleteGCode: false,
      selectedValues: ["default", "default", "default", "default", "default", "default", "default", "default"],
      newGcode: ["", "", "", "", "", "", "", ""],
      defaultMacrosList: [
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
        {
          file_name: "",
        },
      ],
    };
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
    macrosList: function () {
      return this.config.macrosList.map(el => el.file_name);
    },
    getMacrosColor: function () {
      return this.config.macros[this.tab - 1]["color"];
    },
    getMacrosName: function () {
      return this.config.macros[this.tab - 1]["name"];
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    updateNewGcode: function (event) {
      this.newGcode[this.tab - 1] = event.target.value;
    },
    loadMacrosGcode: async function () {
      const file = this.selectedValues[this.tab - 1];
      if (this.selectedValues[this.tab - 1] != "default") {
        const response = await fetch(`/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${file}`, {
          cache: "no-cache",
        });
        const text = (await response.text()).split(" ").join("\n");
        this.$set("newGcode[this.tab-1]", text);
      } else {
        this.$set("newGcode[this.tab-1]", "");
      }
      console.log("newGcode: ", this.newGcode[this.tab - 1]);
    },
    uploadMacrosGcode: async function (e) {
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

      const gcodeData = {
        file_name: file.name,
      };
      if (!this.config.macrosList.some(item => item.file_name == file.name)) {
        console.log("new gcode file");
        this.config.macrosList.push(gcodeData);
        try {
          await api.put("config/save", this.config);
          this.$dispatch("update");
        } catch (error) {
          console.error("Restore Failed: ", error);
          alert("Restore failed");
        }
      } else {
        console.log("Already exists");
      }

      this.$set("selectedValues[this.tab - 1]", file.name);

      SvelteComponents.showDialog("Upload", {
        file,
        onComplete: () => {
          this.last_file_time = undefined; // Force reload
        },
      });
      this.loadMacrosGcode();
    },
    uploadGCode: async function (filename, file) {
      const xhr = new XMLHttpRequest();

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log("File uploaded successfully");
        } else {
          console.error("File upload failed:", xhr.statusText);
        }
      };

      xhr.onerror = function () {
        console.error("Network error during file upload");
      };

      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          console.log("Upload progress:", progress);
        }
      };

      xhr.open("PUT", `/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${encodeURIComponent(filename)}`, true);
      xhr.send(file);

      const gcodeData = {
        file_name: filename,
      };
      if (!this.config.macrosList.some(item => item.file_name == filename)) {
        console.log("new item");
        this.config.macrosList.push(gcodeData);

        try {
          await api.put("config/save", this.config);
          this.$dispatch("update");
        } catch (error) {
          console.error("Restore Failed: ", error);
          alert("Restore failed");
        }
      }
    },
    saveMacros: async function () {
      var macrosName = document.getElementById(`macros-name-${this.tab - 1}`).value;
      var macrosColor = document.getElementById(`macros-color-${this.tab - 1}`).value;

      console.log(" this.state.selected && time: ", this.state.selected, this.state.selected_time);
      console.log("selectedValues: ", this.selectedValues[this.tab - 1]);

      var file_name =
        this.selectedValues[this.tab - 1] == "default" ? macrosName + ".ngc" : this.selectedValues[this.tab - 1];
      var file = this.newGcode[this.tab - 1];

      this.uploadGCode(file_name, file);

      this.config.macros[this.tab - 1].name = macrosName;
      this.config.macros[this.tab - 1].color = macrosColor;
      this.config.macros[this.tab - 1].file_name = file_name;
      console.log("config.macros[this.tab - 1].file_name", this.config.macros[this.tab - 1].file_name);
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
    delete_current: async function () {
      console.log("delete a gcode");
      if (this.selectedValues[this.tab - 1] == "default") {
        this.$set("newGcode[this.tab-1]", "");
      } else {
        api.delete(`file/${this.selectedValues[this.tab - 1]}`);
        this.$set("newGcode[this.tab-1]", "");
        this.config.macrosList = this.config.macrosList.filter(
          item => item.file_name !== this.selectedValues[this.tab - 1],
        );
        this.$set("this.selectedValues[this.tab - 1]", "default");
        try {
          await api.put("config/save", this.config);
          this.$dispatch("update");
        } catch (error) {
          console.error("Restore Failed: ", error);
          alert("Restore failed");
        }
      }
      this.deleteGCode = false;
    },
    delete_all_macros: async function () {
      const macrosList = this.config.macrosList.map(item => item.file_name).toString();
      api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${macrosList}`);
      this.config.macrosList = this.defaultMacrosList;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    cancelMacros: function () {
      const defaultValue = this.config.macros[this.tab - 1];
      document.getElementById(`macros-name-${this.tab - 1}`).value = defaultValue.name;
      document.getElementById(`macros-color-${this.tab - 1}`).value = defaultValue.color;
      document.getElementById(`gcodeSelect-${this.tab - 1}`).value = "default";
      this.$set("newGcode[this.tab-1]", "");
    },
    deleteAllMacros: async function () {
      this.config.macros = [
        {
          name: "Macros 1",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 2",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 3",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 4",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 5",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 6",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 7",
          color: "#dedede",
          file_name: "",
        },
        {
          name: "Macros 8",
          color: "#dedede",
          file_name: "",
        },
      ];
      this.delete_all_macros();
      this.confirmReset = false;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    printState: function () {
      console.log(this.state);
    },
    printConfig: function () {
      console.log(this.config);
    },
    resetMacrosList: async function () {
      this.config.macrosList = this.defaultMacrosList;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
  },
};
