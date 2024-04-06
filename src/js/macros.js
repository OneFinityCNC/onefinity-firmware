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
      macroFound: false,
      GCodeNotFound: false,
      macrosName: "",
      isChecked: false,
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
    macros_gcode_list: function () {
      return (
        this.config.macros_list
          // .filter(item => this.state.files.includes(item.file_name))
          .map(item => item.file_name)
          .sort()
      );
    },
    macros_list: function () {
      return this.config.macros.map(item => item.name);
    },
    initial_tab: function () {
      return this.tab == 0;
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    update_new_gcode: function (event) {
      if (this.tab != 0) {
        this.newGcode = event.target.value;
        this.$dispatch("macros-edited");
      }
    },
    editedColor: function (event) {
      if (this.tab != 0 && this.config.macros[this.tab - 1].color != event.target.value) {
        this.$dispatch("macros-edited");
      }
    },
    editedAlert: function () {
      if (this.tab != 0) {
        this.$dispatch("macros-edited");
      }
    },
    editedName: function (event) {
      if (this.tab != 0 && this.config.macros[this.tab - 1].name != event.target.value) {
        this.$dispatch("macros-edited");
      }
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
    load: async function () {
      if (this.tab == 0) {
        return;
      }
      const file = this.fileName;
      if (file != "default") {
        const response = await fetch(`/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${file}`, {
          cache: "no-cache",
        });
        console.log("response", response);
        if (response.status == 200) {
          const text = await response.text();
          this.newGcode = text;
        } else if (response.status == 400) {
          return (this.GCodeNotFound = true);
        } else {
          return alert("error loading");
        }
      } else {
        this.newGcode = "";
      }
      if (file != this.config.macros[this.tab - 1].file_name) {
        this.$dispatch("macros-edited");
      }
    },
    removeFromList: async function () {
      this.config.macros_list = this.config.macros_list.filter(item => item.file_name != this.fileName);
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    upload: async function (e) {
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
      if (!this.config.macros_list.some(item => item.file_name == file.name)) {
        this.fileName = file.name;
        this.config.macros_list.push(gcodeData);
        try {
          await api.put("config/save", this.config);
          this.$dispatch("update");
        } catch (error) {
          console.error("Restore Failed: ", error);
          alert("Restore failed");
        }
      }
      this.$dispatch("macros-edited");
      try {
        await this.showDialogAsync("Upload", file);
        this.load();
      } catch (error) {
        console.error("Error uploading: ", error);
      }
    },
    upload_gcode: async function (filename, file) {
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
      if (!this.config.macros_list.some(item => item.file_name == filename)) {
        this.config.macros_list.push(gcodeData);
      }
    },
    save_macro: async function () {
      if (this.tab == 0) {
        this.clear_macro();
        return;
      }
      const macros = [...this.config.macros];
      macros.splice(this.tab - 1, 1);
      const macros_list = macros.map(item => item.name);
      var macrosName = document.getElementById(`macros-name`).value;
      var macrosColor = document.getElementById("macros-color").value;
      var macrosAlert = this.isChecked;
      const formattedFilename = macrosName
        .replace(/\\/g, "_")
        .replace(/\//g, "_")
        .replace(/#/g, "-")
        .replace(/\?/g, "-");

      if (macros_list.includes(formattedFilename)) {
        this.sameName = true;
        this.confirmSave = false;
        return;
      }

      var file_name = this.fileName == "default" ? formattedFilename + ".ngc" : this.fileName;
      var file = this.newGcode;

      if (file.trim() != "") {
        this.upload_gcode(file_name, file);
      }

      this.config.macros[this.tab - 1].name = macrosName;
      this.config.macros[this.tab - 1].color = macrosColor;
      this.config.macros[this.tab - 1].file_name = file_name;
      this.config.macros[this.tab - 1].alert = macrosAlert;
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
    },
    check_gcode_with_macro: function () {
      const macro_with_filename = this.config.macros.find(item => item.file_name == this.fileName);
      if (macro_with_filename) {
        this.deleteGCode = false;
        this.macroFound = true;
      } else {
        this.delete_current();
      }
    },
    delete_current: async function () {
      const filename = this.fileName;
      const macro_with_filename = this.config.macros.filter(item => item.file_name == this.fileName);
      if (macro_with_filename.length != 0) {
        this.macroFound = false;
        macro_with_filename.forEach(item => (item.file_name = "default"));
      }
      if (filename == "default") {
        this.newGcode = "";
      } else {
        api.delete(`file/${filename}`);
        this.newGcode = "";
        this.config.macros_list = this.config.macros_list.filter(item => item.file_name !== filename);
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
    clear_macro: async function () {
      if (this.tab == 0 || this.tab > this.config.macros.length) {
        document.getElementById("macros-name").value = "";
        document.getElementById("macros-color").value = "#ffffff";
        this.isChecked = true;
        this.fileName = "default";
        this.tab = "0";
        this.newGcode = "";
      } else {
        const defaultValue = this.config.macros[this.tab - 1];
        document.getElementById("macros-name").value = defaultValue.name;
        document.getElementById("macros-color").value = defaultValue.color;
        this.isChecked = defaultValue.alert;
        this.fileName = defaultValue.file_name;
        this.load();
      }
      this.edited = false;
    },
    delete_all_macros: async function () {
      this.config.macros = [
        {
          name: "Macro 1",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 2",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 3",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 4",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 5",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 6",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 7",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
        {
          name: "Macro 8",
          color: "#dedede",
          file_name: "default",
          alert: true,
        },
      ];
      const macros_list = this.config.macros_list.map(item => item.file_name).toString();
      api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${macros_list}`);
      this.config.macros_list = [];
      this.clear_macro();
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
    add_new_macro: async function () {
      const length = this.config.macros.length;
      if (length >= 20) {
        this.maxLimitReached = true;
        return;
      }
      const newMacros = {
        name: `Macro ${length + 1}`,
        color: "#dedede",
        file_name: "default",
        alert: true,
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
    delete_selected_macro: async function () {
      if (this.tab == 0) {
        this.clear_macro();
        return;
      }
      this.config.macros.splice(this.tab - 1, 1);
      this.clear_macro();
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
      this.deleteSelected = false;
    },
    print_config: function () {
      console.log(this.config);
    },
    print_state: function () {
      console.log(this.state);
    },
  },
};
