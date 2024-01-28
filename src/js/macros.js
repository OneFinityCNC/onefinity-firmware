"use strict";

const api = require("./api");
const utils = require("./utils");

module.exports = {
  template: "#macros-template",
  props: ["config", "template", "state"],

  data: function () {
    return {
      tab: "0",
      confirmReset: false,
      confirmSave: false,
      deleteGCode: false,
      edited: false,
      selectedValues: ["default", "default", "default", "default", "default", "default", "default", "default"],
      newGcode: ["", "", "", "", "", "", "", ""],
    };
  },
  events: {
    "macros-edited": function () {
      this.edited = true;
    },
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
    getMacros: function(){
      return this.config.macros;
    },
    getMacrosColor: function () {
      return this.config.macros[this.tab]["color"];
    },
    getMacrosName: function () {
      return this.config.macros[this.tab]["name"];
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    updateNewGcode: function (event) {
      this.newGcode[this.tab] = event.target.value;
      this.$dispatch("macros-edited");
    },
    loadMacrosGcode: async function () {
      const file = this.selectedValues[this.tab];
      if (this.selectedValues[this.tab] != "default") {
        const response = await fetch(`/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${file}`, {
          cache: "no-cache",
        });
        console.log('response: ',response);
        const text = (await response.text()).split(" ").join("\n");
        console.log('text: ',text);
        this.$set("newGcode[this.tab]", text);
      } else {
        this.$set("newGcode[this.tab]", "");
      }
      this.$dispatch("macros-edited");
      console.log("loaded GCode: ", this.newGcode[this.tab]);
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
        console.log("new gcode file for macros");
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

      this.$set("selectedValues[this.tab]", file.name);
      this.$dispatch("macros-edited");
      console.log("file.name", file.name);
      console.log("file.name type: ", typeof file.name);
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
        console.log("new gcode uploaded for macros");
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
      var macrosName = document.getElementById(`macros-name-${this.tab}`).value;
      var macrosColor = document.getElementById(`macros-color-${this.tab}`).value;

      console.log(" this.state.selected && time: ", this.state.selected, this.state.selected_time);
      console.log("selectedValues: ", this.selectedValues[this.tab]);

      var file_name =
        this.selectedValues[this.tab] == "default" ? macrosName + ".ngc" : this.selectedValues[this.tab];
      var file = this.newGcode[this.tab];

      this.uploadGCode(file_name, file);

      this.config.macros[this.tab].name = macrosName;
      this.config.macros[this.tab].color = macrosColor;
      this.config.macros[this.tab].file_name = file_name;
      console.log("config.macros[this.tab - 1].file_name", this.config.macros[this.tab].file_name);
      this.confirmSave = false;
      try {
        await api.put("config/save", this.config);
        this.edited = false;
        console.log("Successfully saved");
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    delete_current: async function () {
      const filename = this.selectedValues[this.tab];
      console.log("delete a gcode");
      if (filename == "default") {
        this.$set("newGcode[this.tab]", "");
        this.$set("selectedValues[this.tab]", "default");
      } else {
        api.delete(`file/${filename}`);
        this.$set("newGcode[this.tab]", "");
        this.$set("selectedValues[this.tab]", "default");
        this.config.macrosList = this.config.macrosList.filter(item => item.file_name !== filename);
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
      this.config.macrosList = [];
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    cancelMacros: function () {
      const defaultValue = this.config.macros[this.tab];
      document.getElementById(`macros-name-${this.tab}`).value = defaultValue.name;
      document.getElementById(`macros-color-${this.tab}`).value = defaultValue.color;
      document.getElementById("gcode-field").value = "";
      this.$set("newGcode[this.tab]", "");
      this.$set("selectedValues[this.tab]", "default");
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
      this.cancelMacros();
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
      this.config.macrosList = [];
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    addNewMacros: async function () {
      const length = this.config.macros.length;
      const newMacros = {
        name: `Macros ${length + 1}`,
        color: "#dedede",
        file_name: "",
      };
      this.config.macros.push(newMacros);
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
