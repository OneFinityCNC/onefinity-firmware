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
      deleteSelected: false,
      deleteGCode: false,
      sameName: false,
      edited: false,
      addMacros: false,
      maxLimitReached: false,
      macrosName: "",
      fileName: "default",
      newGcode: "",
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
    macrosLength: function () {
      return this.tab > 8;
    },
    macrosGCodeList: function () {
      return this.config.macrosList.map(el => el.file_name).sort();
    },
    macrosList: function () {
      return this.config.macros.map(item => item.name);
    },
    getMacrosColor: function () {
      return this.config.macros[this.tab - 1]["color"];
    },
    getMacrosName: function () {
      return this.config.macros[this.tab - 1]["name"];
    },
    initial_tab: function () {
      return this.tab == 0;
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    updateNewGcode: function (event) {
      this.newGcode = event.target.value;
      this.$dispatch("macros-edited");
    },
    showDialogAsync: function (title, file) {
      return new Promise((resolve, reject) => {
        SvelteComponents.showDialog(title, {
          file,
          onComplete: () => {
            this.last_file_time = undefined; // Force reload
            resolve(true);
          },
          onerror: () => reject(false),
        });
      });
    },
    loadMacrosGcode: async function () {
      const file = this.fileName;
      if (file != "default") {
        const response = await fetch(`/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${file}`, {
          cache: "no-cache",
        });
        console.log("response status: ", response.status);
        if (response.status == 200) {
          const text = (await response.text()).split(" ").join("\n");
          console.log("text: ", text);
          this.newGcode = text;
        } else {
          console.log("error loading");
        }
      } else {
        this.newGcode = "";
      }
      this.$dispatch("macros-edited");
      console.log("loaded GCode: ", this.newGcode);
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
        this.fileName = file.name;
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
      this.$dispatch("macros-edited");
      console.log("file.name", file.name);
      try {
        await this.showDialogAsync("Upload", file);
        this.loadMacrosGcode();
      } catch (error) {
        console.error("Error uploading: ", error);
      }
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
      }
    },
    saveMacros: async function () {
      if (this.tab == 0) {
        this.clearMacros();
        return;
      }
      const macros = [...this.config.macros];
      macros.splice(this.tab - 1, 1);
      const macrosList = macros.map(item => item.name);
      var macrosName = document.getElementById("macros-name").value;
      console.log("Macros Name: ", this.macrosName);
      var macrosColor = document.getElementById("macros-color").value;
      if (macrosList.includes(macrosName)) {
        this.sameName = true;
        this.confirmSave = false;
        return;
      }

      console.log(" this.state.selected && time: ", this.state.selected, this.state.selected_time);
      console.log("selectedValues: ", this.config.macros[this.tab - 1].file_name);

      var file_name = this.fileName == "default" ? macrosName + ".ngc" : this.fileName;
      var file = this.newGcode;

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
      this.edited = false;
      console.log("tab in saveMacros:", this.tab);
    },
    delete_current: async function () {
      const filename = this.fileName;
      console.log("delete a gcode");
      if (filename == "default") {
        this.newGcode = "";
      } else {
        api.delete(`file/${filename}`);
        this.newGcode = "";
        this.config.macros[this.tab - 1].file_name = "default";
        this.config.macrosList = this.config.macrosList.filter(item => item.file_name !== filename);
      }
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
      this.fileName = "default";
      this.deleteGCode = false;
    },
    delete_all_macros: async function () {
      const macrosList = this.config.macrosList.map(item => item.file_name).toString();
      api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${macrosList}`);
      this.config.macrosList = [];
    },
    clearMacros: async function () {
      if (this.tab == 0 || this.tab > this.config.macros.length) {
        document.getElementById("macros-name").value = "";
        document.getElementById("macros-color").value = "#ffffff";
        this.fileName = "default";
        this.tab = "0";
        this.newGcode = "";
      } else {
        const defaultValue = this.config.macros[this.tab - 1];
        document.getElementById("macros-name").value = defaultValue.name;
        document.getElementById("macros-color").value = defaultValue.color;
        this.fileName = defaultValue.file_name;
        this.loadMacrosGcode();
      }
      this.edited = false;
    },
    deleteAllMacros: async function () {
      this.config.macros = [
        {
          name: "Macros 1",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 2",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 3",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 4",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 5",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 6",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 7",
          color: "#dedede",
          file_name: "default",
        },
        {
          name: "Macros 8",
          color: "#dedede",
          file_name: "default",
        },
      ];
      this.delete_all_macros();
      this.clearMacros();
      this.edited = false;
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
      console.log(this.newGcode);
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
      if (length >= 20) {
        this.maxLimitReached = true;
        return;
      }
      const newMacros = {
        name: `Macros ${length + 1}`,
        color: "#dedede",
        file_name: "default",
      };
      this.config.macros.push(newMacros);
      this.addMacros = false;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    deleteSelectedMacros: async function () {
      if (this.tab == 0) {
        this.clearMacros();
        return;
      }
      this.config.macros.splice(this.tab - 1, 1);
      this.clearMacros();
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
      this.deleteSelected = false;
    },
    loadMacrosSettings: function () {
      if (this.tab == 0) {
        document.getElementById("macros-name").value = "";
        document.getElementById("macros-color").value = "#fff";
      } else {
        const macros = this.config.macros[this.tab - 1];
        document.getElementById("macros-name").value = macros.name;
        document.getElementById("macros-color").value = macros.color;
      }
      this.newGcode = "";
      this.filename = "default";
      this.edited = false;
    },
  },
};
