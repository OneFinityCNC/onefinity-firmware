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
          gcode_file_name: "FireLaser.ngc",
          gcode_file_time: 1705008250.2333415,
        },
        {
          gcode_file_name: "GoHomeXYZ.ngc",
          gcode_file_time: 1705008321.710827,
        },
        {
          gcode_file_name: "ParkRearRightWW.ngc",
          gcode_file_time: 1705008360.977644,
        },
        {
          gcode_file_name: "SpindleWarmUp1Minute.ngc",
          gcode_file_time: 1705008372.967075,
        },
        {
          gcode_file_name: "TurnOnSpindle.ngc",
          gcode_file_time: 1705008405.5059154,
        },
        {
          gcode_file_name: "TurnOffSpindleAndLaser.ngc",
          gcode_file_time: 1705008384.6566093,
        },
        {
          gcode_file_name: "VacOn.ngc",
          gcode_file_time: 1705008413.7756715,
        },
        {
          gcode_file_name: "TurnOffVac.ngc",
          gcode_file_time: 1705008395.476232,
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
      return this.config.macrosList.map(el => el.gcode_file_name);
    },
    getMacrosColor: function () {
      return this.config.macros[this.tab - 1]['color'];
    },
    getMacrosName: function () {
      return this.config.macros[this.tab - 1]['name'];
    },
  },
  methods: {
    open: function () {
      utils.clickFileInput("gcode-file-input");
    },
    updateNewGcode: function (event) {
      this.newGcode[this.tab - 1] = event.target.value;
    },
    isPresent: function (obj) {
      return this.defaultMacrosList.find(item => item.gcode_file_name == obj.gcode_file_name);
    },
    loadMacrosGcode: async function () {
      const file = this.selectedValues[this.tab - 1];
      if (this.selectedValues[this.tab - 1] != "default") {
        const response = await fetch(`/api/file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${file}`, {
          cache: "no-cache",
        });
        const text = (await response.text()).split(" ").join("\n");
        console.log(text);
        // this.newGcode[this.tab - 1]=text;
        this.$set("newGcode[this.tab-1]", text);
      } else {
        // this.newGcode[this.tab - 1]="";
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
        gcode_file_name: file.name,
        gcode_file_time: this.state.selected_time,
      };
      if (!this.config.macrosList.some(item => item.gcode_file_name == file.name)) {
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

      xhr.open("PUT", `/api/file/${encodeURIComponent(filename)}`, true);
      xhr.send(file);

      const gcodeData = {
        gcode_file_name: filename,
        gcode_file_time: this.state.selected_time,
      };
      if (this.config.macrosList.some(item => item.gcode_file_name !== filename)) {
        console.log('new item');
        this.config.macrosList.push(gcodeData);
      }

      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
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
      this.config.macros[this.tab - 1].gcode_file_name = file_name;
      this.config.macros[this.tab - 1].gcode_file_time = this.state.selected_time;
      console.log("config.macros[this.tab - 1].gcode_file_name", this.config.macros[this.tab - 1].gcode_file_name);
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
        if (!this.isPresent({ gcode_file_name: this.selectedValues[this.tab - 1] })) {
          console.log('this is not default  macros');
          api.delete(`file/${this.selectedValues[this.tab - 1]}`);
          this.$set("newGcode[this.tab-1]", "");
          this.config.macrosList = this.config.macrosList.filter(
            item => item.gcode_file_name !== this.selectedValues[this.tab - 1],
          );
          try {
            await api.put("config/save", this.config);
            this.$dispatch("update");
          } catch (error) {
            console.error("Restore Failed: ", error);
            alert("Restore failed");
          }
        }else{
          alert("You cannot delete GCode of Default Macros");
        }
      }
      this.deleteGCode = false;
    },
    delete_all_macros: async function () {
      const itemsToDelete = this.config.macrosList.filter(el => !this.isPresent(el));
      const macrosList = itemsToDelete.map(item => item.gcode_file_name).toString();
      api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${macrosList}`);
      this.config.macrosList = this.defaultMacrosList;
      this.deleteGCode = false;
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },
    cancelMacros: function () {
      document.getElementById(`macros-name-${this.tab - 1}`).value = "";
      document.getElementById(`macros-color-${this.tab - 1}`).value = "#ffffff";
      document.getElementById(`gcodeSelect-${this.tab - 1}`).value = "default";
      this.newGcode[this.tab - 1] = "";
    },
    resetConfig: async function () {
      this.config.macros = [
        {
          name: "FireLaser",
          color: "#dedede",
          gcode_file_name: "FireLaser.ngc",
          gcode_file_time: 1705008250.2333415,
        },
        {
          name: "Home",
          color: "#dedede",
          gcode_file_name: "GoHomeXYZ.ngc",
          gcode_file_time: 1705008321.710827,
        },
        {
          name: "Park",
          color: "#dedede",
          gcode_file_name: "ParkRearRightWW.ngc",
          gcode_file_time: 1705008360.977644,
        },
        {
          name: "Spindle Warmup",
          color: "#dedede",
          gcode_file_name: "SpindleWarmUp1Minute.ngc",
          gcode_file_time: 1705008372.967075,
        },
        {
          name: "Spindle ON",
          color: "#dedede",
          gcode_file_name: "TurnOnSpindle.ngc",
          gcode_file_time: 1705008405.5059154,
        },
        {
          name: "Spindle OFF",
          color: "#dedede",
          gcode_file_name: "TurnOffSpindleAndLaser.ngc",
          gcode_file_time: 1705008384.6566093,
        },
        {
          name: "Vacuum ON",
          color: "#dedede",
          gcode_file_name: "VacOn.ngc",
          gcode_file_time: 1705008413.7756715,
        },
        {
          name: "Vacuum OFF",
          color: "#dedede",
          gcode_file_name: "TurnOffVac.ngc",
          gcode_file_time: 1705008395.476232,
        },
      ];
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
    resetMacrosList: async function (){
      this.config.macrosList=[
        {
          "gcode_file_name": "FireLaser.ngc",
          "gcode_file_time": 1705008250.2333415
        },
        {
          "gcode_file_name": "GoHomeXYZ.ngc",
          "gcode_file_time": 1705008321.710827
        },
        {
          "gcode_file_name": "ParkRearRightWW.ngc",
          "gcode_file_time": 1705008360.977644
        },
        {
          "gcode_file_name": "SpindleWarmUp1Minute.ngc",
          "gcode_file_time": 1705008372.967075
        },
        {
          "gcode_file_name": "TurnOnSpindle.ngc",
          "gcode_file_time": 1705008405.5059154
        },
        {
          "gcode_file_name": "TurnOffSpindleAndLaser.ngc",
          "gcode_file_time": 1705008384.6566093
        },
        {
          "gcode_file_name": "VacOn.ngc",
          "gcode_file_time": 1705008413.7756715
        },
        {
          "gcode_file_name": "TurnOffVac.ngc",
          "gcode_file_time": 1705008395.476232
        }
      ]
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
