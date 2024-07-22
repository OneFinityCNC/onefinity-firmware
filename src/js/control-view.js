"use strict";

const api = require("./api");
const utils = require("./utils");
const cookie = require("./cookie")("bbctrl-");

module.exports = {
  template: "#control-view-template",
  props: ["config", "template", "state"],

  data: function () {
    return {
      current_time: "",
      mach_units: this.$root.state.metric ? "METRIC" : "IMPERIAL",
      mdi: "",
      last_file: undefined,
      last_file_time: undefined,
      toolpath: {},
      toolpath_progress: 0,
      axes: "xyzabc",
      history: [],
      speed_override: 1,
      feed_override: 1,
      jog_incr_amounts: {
        METRIC: {
          fine: 0.1,
          small: 1.0,
          medium: 10,
          large: 100,
        },
        IMPERIAL: {
          fine: 0.005,
          small: 0.05,
          medium: 0.5,
          large: 5,
        },
      },
      jog_incr: localStorage.getItem("jog_incr") || "small",
      jog_step: cookie.get_bool("jog-step"),
      jog_adjust: parseInt(cookie.get("jog-adjust", 2)),
      deleteGCode: false,
      tab: "auto",
      ask_home: true,
      folder_name: "",
      edited: false,
      uploading_files: false,
      confirmDelete: false,
      create_folder: false,
      showGcodeMessage: false,
      showNoGcodeMessage: false,
      macrosLoading: false,
      show_gcodes: false,
      GCodeNotFound: false,
      filesUploaded: 0,
      totalFiles: 0,
      files_sortby: "By Upload Date",
      selected_items_to_delete: [],
      search_query: "",
      filtered_files: [],
      selected_folder_index: null,
    };
  },

  components: {
    "axis-control": require("./axis-control"),
    "path-viewer": require("./path-viewer"),
    "gcode-viewer": require("./gcode-viewer"),
  },

  watch: {
    jog_incr: function (value) {
      localStorage.setItem("jog_incr", value);
    },

    "state.metric": {
      handler: function (metric) {
        this.mach_units = metric ? "METRIC" : "IMPERIAL";
      },
      immediate: true,
    },

    "state.line": function () {
      if (this.mach_state != "HOMING") {
        this.$broadcast("gcode-line", this.state.line);
      }
    },

    "state.selected_time": function () {
      this.load();
    },

    jog_step: function () {
      cookie.set_bool("jog-step", this.jog_step);
    },

    jog_adjust: function () {
      cookie.set("jog-adjust", this.jog_adjust);
    },
  },

  computed: {
    display_units: {
      cache: false,
      get: function () {
        return this.$root.display_units;
      },
      set: function (value) {
        this.config.settings.units = value;
        this.$root.display_units = value;
        this.$dispatch("config-changed");
      },
    },

    metric: function () {
      return this.display_units === "METRIC";
    },

    mach_state: function () {
      const cycle = this.state.cycle;
      const state = this.state.xx;

      if (state != "ESTOPPED" && (cycle == "jogging" || cycle == "homing")) {
        return cycle.toUpperCase();
      }

      return state || "";
    },

    pause_reason: function () {
      return this.state.pr;
    },

    is_running: function () {
      return this.mach_state == "RUNNING" || this.mach_state == "HOMING";
    },

    is_stopping: function () {
      return this.mach_state == "STOPPING";
    },

    is_holding: function () {
      return this.mach_state == "HOLDING";
    },

    is_ready: function () {
      return this.mach_state == "READY";
    },

    is_idle: function () {
      return this.state.cycle == "idle";
    },

    is_paused: function () {
      return this.is_holding && (this.pause_reason == "User pause" || this.pause_reason == "Program pause");
    },

    can_mdi: function () {
      return this.is_idle || this.state.cycle == "mdi";
    },

    can_set_axis: function () {
      return this.is_idle;

      // TODO allow setting axis position during pause
      // return this.is_idle || this.is_paused;
    },

    message: function () {
      if (this.mach_state == "ESTOPPED") {
        return this.state.er;
      }

      if (this.mach_state == "HOLDING") {
        return this.state.pr;
      }

      if (this.state.messages.length) {
        return this.state.messages.slice(-1)[0].text;
      }

      return "";
    },

    highlight_state: function () {
      return this.mach_state == "ESTOPPED" || this.mach_state == "HOLDING";
    },

    plan_time: function () {
      return this.state.plan_time;
    },

    plan_time_remaining: function () {
      if (!(this.is_stopping || this.is_running || this.is_holding)) {
        return 0;
      }

      return this.toolpath.time - this.plan_time;
    },

    eta: function () {
      if (this.mach_state != "RUNNING") {
        return "";
      }

      const remaining = this.plan_time_remaining;
      const d = new Date();
      d.setSeconds(d.getSeconds() + remaining);
      return d.toLocaleString();
    },

    progress: function () {
      if (!this.toolpath.time || this.is_ready) {
        return 0;
      }

      const p = this.plan_time / this.toolpath.time;
      return Math.min(1, p);
    },
    gcode_files: function () {
      if (!this.state.folder) {
        return [];
      }
      const folder = this.state.gcode_list.find(item => item.name == this.state.folder);
      if (!folder) {
        return [];
      }
      const files = folder.files.filter(item => this.state.files.includes(item.file_name)).map(item => item.file_name);
      if (this.files_sortby == "A-Z") {
        return files.sort();
      } else if (this.files_sortby == "Z-A") {
        return files.sort().reverse();
      } else {
        return files;
      }
    },
    gcode_filtered_files: function () {
      return this.filtered_files.filter(file => file.toLowerCase().includes(this.search_query.toLowerCase()));
    },
    gcode_folders: function () {
      return this.state.gcode_list
        .map(item => item.name)
        .filter(element => element !== "default")
        .sort();
    },
  },

  events: {
    jog: function (axis, power) {
      const data = { ts: new Date().getTime() };
      data[axis] = power;
      api.put("jog", data);
    },

    back2zero: function (axis0, axis1) {
      this.send(`G0 ${axis0}0 ${axis1}0`);
    },

    step: function (axis, value) {
      this.send(`
                M70
                G91
                G0 ${axis}${value}
                M72
            `);
    },
    folder_name_edited: function () {
      this.edited = true;
    },
  },

  ready: function () {
    this.load();

    setInterval(() => {
      this.current_time = new Date().toLocaleTimeString();
    }, 1000);

    SvelteComponents.registerControllerMethods({
      stop: (...args) => this.stop(...args),
      send: (...args) => this.send(...args),
      isAxisHomed: axis => this[axis].homed,
      unhome: (...args) => this.unhome(...args),
      set_position: (...args) => this.set_position(...args),
      set_home: (...args) => this.set_home(...args),
    });
  },

  methods: {
    save_config: async function (config) {
      try {
        await api.put("config/save", config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
    },

    populateFiles(index) {
      this.selected_folder_index = index;
      this.filtered_files = this.state.gcode_list[index].files.map(item => item.file_name);
    },

    getJogIncrStyle(value) {
      const weight = `font-weight:${this.jog_incr === value ? "bold" : "normal"}`;
      const color = this.jog_incr === value ? "color:#0078e7" : "";

      return [weight, color].join(";");
    },

    jog_fn: function (x_jog, y_jog, z_jog, a_jog) {
      const amount = this.jog_incr_amounts[this.display_units][this.jog_incr];

      const xcmd = `X${x_jog * amount}`;
      const ycmd = `Y${y_jog * amount}`;
      const zcmd = `Z${z_jog * amount}`;
      const acmd = `A${a_jog * amount}`;

      this.send(`
                G91
                ${this.metric ? "G21" : "G20"}
                G0 ${xcmd}${ycmd}${zcmd}${acmd}
            `);
    },

    send: function (msg) {
      this.$dispatch("send", msg);
    },

    toggle_sorting: function () {
      if (this.files_sortby === "By Upload Date") {
        this.files_sortby = "A-Z";
      } else if (this.files_sortby === "A-Z") {
        this.files_sortby = "Z-A";
      } else if (this.files_sortby === "Z-A") {
        this.files_sortby = "By Upload Date";
      }
    },

    load: function () {
      const file_time = this.state.selected_time;
      const file = this.state.selected;
      if (this.last_file == file && this.last_file_time == file_time) {
        return;
      }

      if (this.state.selected && !this.state.files.includes(this.state.selected)) {
        this.GCodeNotFound = true;
        return;
      }

      this.last_file = file;
      this.last_file_time = file_time;

      this.$broadcast("gcode-load", file);
      this.$broadcast("gcode-line", this.state.line);
      this.toolpath_progress = 0;
      this.load_toolpath(file, file_time);
    },

    load_toolpath: async function (file, file_time) {
      this.toolpath = {};

      if (!file || this.last_file_time != file_time) {
        return;
      }

      this.showGcodeMessage = true;

      while (this.showGcodeMessage) {
        try {
          const toolpath = await api.get(`path/${file}`);
          this.toolpath_progress = toolpath.progress;

          if (toolpath.progress === 1 || typeof toolpath.progress == "undefined") {
            this.showGcodeMessage = false;

            if (toolpath.bounds) {
              toolpath.filename = file;
              this.toolpath_progress = 1;
              this.toolpath = toolpath;

              const state = this.$root.state;
              for (const axis of "xyzabc") {
                Vue.set(state, `path_min_${axis}`, toolpath.bounds.min[axis]);
                Vue.set(state, `path_max_${axis}`, toolpath.bounds.max[axis]);
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    },

    submit_mdi: function () {
      this.send(this.mdi);

      if (!this.history.length || this.history[0] != this.mdi) {
        this.history.unshift(this.mdi);
      }

      this.mdi = "";
    },

    mdi_start_pause: function () {
      if (this.state.xx == "RUNNING") {
        this.pause();
      } else if (this.state.xx == "STOPPING" || this.state.xx == "HOLDING") {
        this.unpause();
      } else {
        this.submit_mdi();
      }
    },

    load_history: function (index) {
      this.mdi = this.history[index];
    },

    open_file: function () {
      utils.clickFileInput("gcode-file-input");
    },

    open_folder: function () {
      utils.clickFileInput("gcode-folder-input");
    },

    edited_folder_name: function (event) {
      if (event.target.value.trim() != "") {
        this.$dispatch("folder_name_edited");
      }
    },

    update_config: function () {
      this.config.gcode_list = [...this.state.gcode_list];
      this.config.non_macros_list = [...this.state.non_macros_list];
      this.config.macros_list = [...this.state.macros_list];
      this.config.macros = [...this.state.macros];
    },

    reset_gcode: function () {
      this.state.selected = "";
      this.last_file = "";
      this.$broadcast("gcode-load", "");
    },

    upload_gcode: async function (filename, file) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        this.filesUploaded++;
        if (this.filesUploaded == this.totalFiles) {
          this.uploading_files = false;
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve("file uploaded");
          } else {
            console.error("File upload failed:", xhr.statusText);
            reject("upload failed");
          }
        };

        xhr.onerror = () => {
          alert("Upload failed.");
          reject("upload failed");
        };

        xhr.open("PUT", `/api/file/${encodeURIComponent(filename)}`, true);
        xhr.send(file);
      });
    },

    readFile: function (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result);
        };

        reader.onerror = error => {
          reject(error);
        };

        reader.readAsText(file, "utf-8");
      });
    },

    validateFiles: async function (files) {
      const validFiles = [];
      for (const file of files) {
        const extension = file.name.split(".").pop().toLowerCase();
        const validExtensions = ["nc", "ngc", "gcode", "gc"];

        if (validExtensions.includes(extension)) {
          validFiles.push(file);
        } else {
          alert(`Unsupported file : ${file.name}`);
          this.filesUploaded++;
          if (this.filesUploaded == this.totalFiles) {
            this.uploadFiles = false;
          }
        }
      }

      return validFiles;
    },

    uploadValidFiles: async function (files, folderName) {
      const updatedConfig = { ...this.config };

      for (const file of files) {
        try {
          const gcode = await this.readFile(file);
          await this.upload_gcode(file.name, gcode);

          const isAlreadyPresent = updatedConfig.non_macros_list.some(element => element.file_name === file.name);

          if (!isAlreadyPresent) {
            updatedConfig.non_macros_list.push({ file_name: file.name });
          }

          if (folderName) {
            const folder = updatedConfig.gcode_list.find(item => item.type == "folder" && item.name == folderName);
            if (folder) {
              if (!folder.files.map(item => item.file_name).includes(file.name)) {
                folder.files.push({ file_name: file.name });
              }
            } else {
              updatedConfig.gcode_list.push({
                name: folderName,
                type: "folder",
                files: [
                  {
                    file_name: file.name,
                  },
                ],
              });
            }
          } else {
            var folder_to_add = updatedConfig.gcode_list.find(
              item => item.type == "folder" && item.name == this.state.folder,
            );
            if (!folder_to_add) {
              folder_to_add = updatedConfig.gcode_list.unshift({
                name: this.state.folder,
                type: "folder",
                files: [
                  {
                    file_name: file.name,
                  },
                ],
              });
              folder_to_add = updatedConfig.gcode_list[0];
            }
            if (!folder_to_add.files.find(item => item.file_name == file.name)) {
              folder_to_add.files.push({ file_name: file.name });
            }
          }
        } catch (error) {
          console.warn(`error uploading file : `, error);
        }
      }
      return updatedConfig;
    },

    upload_files: async function (files, folderName) {
      this.update_config();

      const validFiles = await this.validateFiles(files);
      const updatedConfig = await this.uploadValidFiles(validFiles, folderName);

      await this.save_config(updatedConfig);
    },

    upload_file: async function (e) {
      this.uploading_files = true;
      this.filesUploaded = 0;

      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }

      this.totalFiles = files.length;

      await this.upload_files(files);
    },

    create_new_folder: async function () {
      const folder_name = this.folder_name.trim();
      if (folder_name != "") {
        if (this.state.gcode_list.find(item => item.type == "folder" && item.name == folder_name)) {
          alert("Folder with the same name already exists!");
          return;
        } else {
          this.update_config();
          this.config.gcode_list.push({
            name: folder_name,
            type: "folder",
            files: [],
          });
        }
        this.state.folder = folder_name;
        this.edited = false;
        this.create_folder = false;
        this.folder_name = "";
        this.save_config(this.config);
      }
    },

    cancel_new_folder: function () {
      this.create_folder = false;
      this.folder_name = "";
    },

    upload_folder: async function (e) {
      this.uploading_files = true;
      this.filesUploaded = 0;

      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }
      this.totalFiles = files.length;
      const folderName = files[0].webkitRelativePath.split("/")[0];

      this.upload_files(files, folderName);
    },

    delete_current: async function () {
      if (!this.state.selected) {
        this.deleteGCode = false;
        return;
      }

      this.update_config();

      this.config.non_macros_list = this.config.non_macros_list.filter(
        item => !this.selected_items_to_delete.includes(item.file_name),
      );
      const folder_to_update = this.config.gcode_list.find(
        item => item.name == this.config.gcode_list[this.selected_folder_index].name && item.type == "folder",
      );
      folder_to_update.files = folder_to_update.files.filter(
        item => !this.selected_items_to_delete.includes(item.file_name),
      );

      const exception_list = this.state.macros_list.map(item => item.file_name);
      let files_to_delete = this.selected_items_to_delete.filter(item => !exception_list.includes(item));

      await api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${files_to_delete.toString()}`);

      this.save_config(this.config);
      this.filtered_files = [];
      this.search_query = "";
      this.selected_folder_index = null;
      this.selected_items_to_delete = [];
      this.deleteGCode = false;
    },

    cancel_delete: function () {
      this.filtered_files = [];
      this.search_query = "";
      this.selected_folder_index = null;
      this.selected_items_to_delete = [];
      this.deleteGCode = false;
    },

    delete_all: function () {
      api.delete("file");
      this.deleteGCode = false;
    },

    delete_all_except_macros: async function () {
      this.update_config();
      const macrosList = this.state.macros_list.map(item => item.file_name).toString();
      api.delete(`file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${macrosList}`);
      this.config.non_macros_list = [];
      this.config.gcode_list = [
        {
          name: "default",
          type: "folder",
          files: [],
        },
      ];

      this.save_config(this.config);
      this.state.folder = "default";
      this.state.selected = "";
      this.selected_items_to_delete = [];
      this.deleteGCode = false;
    },

    delete_folder: async function () {
      this.update_config();
      if (this.state.folder && this.state.folder != "default") {
        const files_to_move = this.config.gcode_list.find(
          item => item.type == "folder" && item.name == this.state.folder,
        );
        if (files_to_move) {
          const default_folder = this.config.gcode_list.find(item => item.name == "default");
          default_folder.files = [...default_folder.files, ...files_to_move.files].sort();
          this.config.gcode_list = this.config.gcode_list.filter(item => item.name != this.state.folder);
          this.save_config(this.config);
        }
      }
      this.state.folder = "default";
      this.confirmDelete = false;
    },
    delete_folder_and_files: async function () {
      if (!this.state.folder) {
        this.confirmDelete = false;
        return;
      }

      this.update_config();

      const selected_folder = this.config.gcode_list.find(
        item => item.type == "folder" && item.name == this.state.folder,
      );
      if (!selected_folder) {
        return;
      }
      const macrosList = this.state.macros_list.map(item => item.file_name);
      var files_to_delete = selected_folder.files
        .map(item => item.file_name)
        .filter(item => !macrosList.includes(item));
      if (selected_folder.name != "default") {
        this.config.gcode_list = this.config.gcode_list.filter(item => item.name != this.state.folder);
      } else {
        selected_folder.files = [];
      }

      await api.delete(`file/DINCAIQABiDARixAxiABDIHCAMQABiABDIHCAQQABiABDIH${files_to_delete.toString()}`);
      this.config.non_macros_list = this.config.non_macros_list.filter(
        item => !files_to_delete.includes(item.file_name),
      );
      this.save_config(this.config);
      this.state.folder = "default";
      this.confirmDelete = false;
    },

    home: function (axis) {
      this.ask_home = false;

      if (typeof axis == "undefined") {
        api.put("home");
      } else if (this[axis].homingMode != "manual") {
        api.put(`home/${axis}`);
      } else {
        SvelteComponents.showDialog("ManualHomeAxis", { axis });
      }
    },

    set_home: function (axis, position) {
      api.put(`home/${axis}/set`, { position: parseFloat(position) });
    },

    unhome: function (axis) {
      api.put(`home/${axis}/clear`);
    },

    show_set_position: function (axis) {
      SvelteComponents.showDialog("SetAxisPosition", { axis });
    },

    showMoveToZeroDialog: function (axes) {
      SvelteComponents.showDialog("MoveToZero", { axes });
    },

    showToolpathMessageDialog: function (axis) {
      SvelteComponents.showDialog("Message", { title: this[axis].toolmsg });
    },

    set_position: function (axis, position) {
      api.put(`position/${axis}`, { position: parseFloat(position) });
    },

    zero_all: function () {
      for (const axis of "xyzabc") {
        if (this[axis].enabled) {
          this.zero(axis);
        }
      }
    },

    zero: function (axis) {
      if (typeof axis == "undefined") {
        this.zero_all();
      } else {
        this.set_position(axis, 0);
      }
    },

    start_pause: function () {
      this.macrosLoading = false;
      if (this.state.xx == "RUNNING") {
        this.pause();
      } else if (this.state.xx == "STOPPING" || this.state.xx == "HOLDING") {
        this.unpause();
      } else {
        this.start();
      }
    },

    start: function () {
      api.put("start");
    },

    pause: function () {
      api.put("pause");
    },

    unpause: function () {
      api.put("unpause");
    },

    optional_pause: function () {
      api.put("pause/optional");
    },

    stop: function () {
      api.put("stop");
    },

    step: function () {
      api.put("step");
    },

    override_feed: function () {
      api.put(`override/feed/${this.feed_override}`);
    },

    override_speed: function () {
      api.put(`override/speed/${this.speed_override}`);
    },

    current: function (axis, value) {
      const x = value / 32.0;
      if (this.state[`${axis}pl`] == x) {
        return;
      }

      const data = {};
      data[`${axis}pl`] = x;
      this.send(JSON.stringify(data));
    },

    showProbeDialog: function (probeType) {
      SvelteComponents.showDialog("Probe", { probeType });
    },
    run_macro: function (id) {
      if (this.state.macros[id].file_name == "default") {
        this.showNoGcodeMessage = true;
      } else {
        if (this.state.macros[id].file_name != this.state.selected) {
          this.state.selected = this.state.macros[id].file_name;
        }
        try {
          this.load();
          if (this.state.macros[id].alert == true) {
            this.macrosLoading = true;
          } else {
            setImmediate(() => this.start_pause());
          }
        } catch (error) {
          console.warn("Error running program: ", error);
        }
      }
    },
  },

  mixins: [require("./axis-vars")],
};
