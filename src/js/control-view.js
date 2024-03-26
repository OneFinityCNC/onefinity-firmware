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
      showGcodeMessage: false,
      showNoGcodeMessage: false,
      macrosLoading: false,
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
    gcodeFiles: function () {
      const filesWithNoMacros = this.state.files.filter(
        item => !this.config.macros_list.some(compareItem => compareItem.file_name == item),
      );
      const gcodeList = this.config.non_macros_list.map(item => item.file_name);
      const unionSet = new Set([...filesWithNoMacros, ...gcodeList]);
      const files = [...unionSet].sort();
      return files;
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

    load: function () {
      const file_time = this.state.selected_time;
      const file = this.state.selected;
      if (this.last_file == file && this.last_file_time == file_time) {
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

    upload_file: async function (e) {
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

      const isAlreadyPresent = this.config.non_macros_list.find(element => element.file_name == file.name);
      if (isAlreadyPresent == undefined) {
        this.config.non_macros_list.push({ file_name: file.name });
        try {
          await api.put("config/save", this.config);
          this.$dispatch("update");
        } catch (error) {
          console.error("Restore Failed: ", error);
          alert("Restore failed");
        }
      }

      SvelteComponents.showDialog("Upload", {
        file,
        onComplete: () => {
          this.last_file_time = undefined; // Force reload
          this.$broadcast("gcode-reload", file.name);
        },
      });
    },

    upload_folder: async function (e) {
      const files = e.target.files || e.dataTransfer.files;
      if (!files.length) {
        return;
      }
      const folderName = files[0].webkitRelativePath.split("/")[0];
      console.log(files);
      for (let file of files) {
        console.log(file);
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

        const isAlreadyPresent = this.config.non_macros_list.find(element => element.file_name == file.name);
        if (isAlreadyPresent == undefined) {
          this.config.non_macros_list.push({ file_name: file.name });
          try {
            await api.put("config/save", this.config);
            this.$dispatch("update");
          } catch (error) {
            console.error("Restore Failed: ", error);
            alert("Restore failed");
          }
        }

        SvelteComponents.showDialog("Upload", {
          file,
          onComplete: () => {
            this.last_file_time = undefined; // Force reload
            this.$broadcast("gcode-reload", file.name);
          },
        });
      }
    },

    delete_current: function () {
      if (this.config.macros_list.find(item => item.file_name == this.state.selected) == undefined) {
        if (this.state.selected) {
          this.config.non_macros_list = this.config.non_macros_list.filter(item => item.file_name != this.state.selected);
          api.delete(`file/${this.state.selected}`);
        }
      } else {
        this.config.non_macros_list = this.config.non_macros_list.filter(item => item.file_name != this.state.selected);
      }

      this.deleteGCode = false;
    },

    delete_all: function () {
      api.delete("file");
      this.deleteGCode = false;
    },

    delete_all_except_macros: async function () {
      const macrosList = this.config.macros_list.map(item => item.file_name).toString();
      api.delete(`file/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE${macrosList}`);
      this.config.non_macros_list = [];
      try {
        await api.put("config/save", this.config);
        this.$dispatch("update");
      } catch (error) {
        console.error("Restore Failed: ", error);
        alert("Restore failed");
      }
      this.deleteGCode = false;
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
    runMacros: function (id) {
      if (this.config.macros[id].file_name == "default") {
        this.showNoGcodeMessage = true;
      } else {
        if (this.config.macros[id].file_name != this.state.selected) {
          this.state.selected = this.config.macros[id].file_name; //TODO :get file
        }
        try {
          this.load();
          console.log("selected", this.state);
          if (this.config.macros[id].alert == true) {
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
