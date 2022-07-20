'use strict'

var api = require('./api');
var cookie = require('./cookie')('bbctrl-');

module.exports = {
  template: '#control-view-template',
  props: ['config', 'template', 'state'],

  data: function () {
    return {
      mach_units: this.$root.state.metric ? "METRIC" : "IMPERIAL",
      mdi: '',
      last_file: undefined,
      last_file_time: undefined,
      toolpath: {},
      toolpath_progress: 0,
      axes: 'xyzabc',
      history: [],
      speed_override: 1,
      feed_override: 1,
      manual_home: {
        x: false,
        y: false,
        z: false,
        a: false,
        b: false,
        c: false
      },
      position_msg: {
        x: false,
        y: false,
        z: false,
        a: false,
        b: false,
        c: false
      },
      jog_incr_amounts: {
        "METRIC": {
          fine: 0.1,
          small: 1.0,
          medium: 10,
          large: 100,
        },
        "IMPERIAL": {
          fine: 0.005,
          small: 0.05,
          medium: 0.5,
          large: 5,
        }
      },
      axis_position: 0,
      jog_incr: localStorage.getItem("jog_incr") || 'small',
      jog_step: cookie.get_bool('jog-step'),
      jog_adjust: parseInt(cookie.get('jog-adjust', 2)),
      deleteGCode: false,
      tab: 'auto',
      toolpath_msg: {
        x: false,
        y: false,
        z: false,
        a: false,
        b: false,
        c: false
      },
      ask_home: true,
      ask_zero_xy_msg: false,
      ask_zero_z_msg: false,
      showGcodeMessage: false
    }
  },

  components: {
    'axis-control': require('./axis-control'),
    'path-viewer': require('./path-viewer'),
    'gcode-viewer': require('./gcode-viewer')
  },

  watch: {
    jog_incr: function (value) {
      localStorage.setItem("jog_incr", value);
    },

    'state.metric': {
      handler: function (metric) {
        this.mach_units = metric
          ? 'METRIC'
          : 'IMPERIAL';
      },
      immediate: true
    },

    'state.line': function () {
      if (this.mach_state != 'HOMING') {
        this.$broadcast('gcode-line', this.state.line);
      }
    },

    'state.selected_time': function () {
      this.load();
    },

    jog_step: function () {
      cookie.set_bool('jog-step', this.jog_step);
    },

    jog_adjust: function () {
      cookie.set('jog-adjust', this.jog_adjust);
    }
  },

  computed: {
    display_units: {
      cache: false,
      get: function () {
        return this.$root.display_units;
      },
      set: function (value) {
        this.$root.display_units = value;
      }
    },

    metric: function () {
      return this.display_units === "METRIC";
    },

    mach_state: function () {
      var cycle = this.state.cycle;
      var state = this.state.xx;

      if (typeof cycle != 'undefined' && state != 'ESTOPPED' &&
        (cycle == 'jogging' || cycle == 'homing')) {
        return cycle.toUpperCase();
      }

      return state || ''
    },

    pause_reason: function () {
      return this.state.pr
    },

    is_running: function () {
      return this.mach_state == 'RUNNING' || this.mach_state == 'HOMING';
    },

    is_stopping: function () {
      return this.mach_state == 'STOPPING'
    },

    is_holding: function () {
      return this.mach_state == 'HOLDING'
    },

    is_ready: function () {
      return this.mach_state == 'READY'
    },

    is_idle: function () {
      return this.state.cycle == 'idle'
    },

    is_paused: function () {
      return this.is_holding &&
        (this.pause_reason == 'User pause' ||
          this.pause_reason == 'Program pause')
    },

    can_mdi: function () {
      return this.is_idle || this.state.cycle == 'mdi'
    },

    can_set_axis: function () {
      return this.is_idle
      // TODO allow setting axis position during pause
      return this.is_idle || this.is_paused
    },

    message: function () {
      if (this.mach_state == 'ESTOPPED') {
        return this.state.er;
      }

      if (this.mach_state == 'HOLDING') {
        return this.state.pr;
      }

      if (this.state.messages.length) {
        return this.state.messages.slice(-1)[0].text;
      }

      return '';
    },

    highlight_state: function () {
      return this.mach_state == 'ESTOPPED' || this.mach_state == 'HOLDING';
    },

    plan_time: function () {
      return this.state.plan_time
    },

    plan_time_remaining: function () {
      if (!(this.is_stopping || this.is_running || this.is_holding)) {
        return 0;
      }

      return this.toolpath.time - this.plan_time
    },

    eta: function () {
      if (this.mach_state != 'RUNNING') {
        return '';
      }

      var remaining = this.plan_time_remaining;
      var d = new Date();
      d.setSeconds(d.getSeconds() + remaining);
      return d.toLocaleString();
    },

    progress: function () {
      if (!this.toolpath.time || this.is_ready) {
        return 0;
      }

      var p = this.plan_time / this.toolpath.time;
      return p < 1 ? p : 1;
    }
  },

  events: {
    jog: function (axis, power) {
      var data = { ts: new Date().getTime() };
      data[axis] = power;
      api.put('jog', data);
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

    SvelteComponents.registerControllerMethods({
      stop: (...args) => this.stop(...args),
      send: (...args) => this.send(...args),
      goto_zero: (...args) => this.goto_zero(...args)
    });
  },

  methods: {
    goto_zero(zero_x, zero_y, zero_z, zero_a) {
      const xcmd = zero_x ? "X0" : "";
      const ycmd = zero_y ? "Y0" : "";
      const zcmd = zero_z ? "Z0" : "";
      const acmd = zero_a ? "A0" : "";

      this.ask_zero_xy_msg = false;
      this.ask_zero_z_msg = false;

      this.send('G90\nG0' + xcmd + ycmd + zcmd + acmd + '\n');
    },

    getJogIncrStyle(value) {
      const weight = `font-weight:${this.jog_incr === value ? 'bold' : 'normal'}`;
      const color = this.jog_incr === value ? "color:#0078e7" : "";

      return [weight, color].join(';');
    },

    jog_fn: function (x_jog, y_jog, z_jog, a_jog) {
      const amount = this.jog_incr_amounts[this.display_units][this.jog_incr];

      var xcmd = "X" + x_jog * amount;
      var ycmd = "Y" + y_jog * amount;
      var zcmd = "Z" + z_jog * amount;
      var acmd = "A" + a_jog * amount;

      this.send(`
        G91
        ${this.metric ? "G21" : "G20"}
        G0 ${xcmd}${ycmd}${zcmd}${acmd}
      `);
    },

    send: function (msg) {
      this.$dispatch('send', msg)
    },

    load: function () {
      var file_time = this.state.selected_time;
      var file = this.state.selected;
      if (this.last_file == file && this.last_file_time == file_time) {
        return;
      }

      this.last_file = file;
      this.last_file_time = file_time;

      this.$broadcast('gcode-load', file);
      this.$broadcast('gcode-line', this.state.line);
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

        if (toolpath.progress === 1 || typeof toolpath.progress == 'undefined') {
          this.showGcodeMessage = false

          if (toolpath.bounds) {
            toolpath.filename = file;
            this.toolpath_progress = 1;
            this.toolpath = toolpath;

            const state = this.$root.state;
            for (let axis of 'xyzabc') {
              Vue.set(state, 'path_min_' + axis, toolpath.bounds.min[axis]);
              Vue.set(state, 'path_max_' + axis, toolpath.bounds.max[axis]);
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

      this.mdi = '';
    },

    mdi_start_pause: function () {
      if (this.state.xx == 'RUNNING') {
        this.pause();
      } else if (this.state.xx == 'STOPPING' || this.state.xx == 'HOLDING') {
        this.unpause();
      } else {
        this.submit_mdi();
      }
    },

    load_history: function (index) {
      this.mdi = this.history[index];
    },

    open: function (e) {
      // If we don't reset the form the browser may cache file if name is same
      // even if contents have changed
      $('.gcode-file-input')[0].reset();
      $('.gcode-file-input input').click();
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

      SvelteComponents.showDialog("Upload", {
        file,
        onComplete: () => {
          this.last_file_time = undefined; // Force reload
          this.$broadcast('gcode-reload', file.name);
        }
      });
    },

    delete_current: function () {
      if (this.state.selected) {
        api.delete('file/' + this.state.selected);
      }

      this.deleteGCode = false;
    },

    delete_all: function () {
      api.delete('file');
      this.deleteGCode = false;
    },

    home: function (axis) {
      this.ask_home = false;

      if (typeof axis == 'undefined') {
        api.put('home');
      } else if (this[axis].homingMode != 'manual') {
        api.put('home/' + axis);
      } else {
        this.manual_home[axis] = true;
      }
    },

    set_home: function (axis, position) {
      this.manual_home[axis] = false;
      api.put('home/' + axis + '/set', { position: parseFloat(position) });
    },

    unhome: function (axis) {
      this.position_msg[axis] = false;
      api.put('home/' + axis + '/clear');
    },

    show_set_position: function (axis) {
      this.axis_position = 0;
      this.position_msg[axis] = true;
    },

    show_toolpath_msg: function (axis) {
      this.toolpath_msg[axis] = true;
    },

    set_position: function (axis, position) {
      this.position_msg[axis] = false;
      api.put('position/' + axis, { 'position': parseFloat(position) });
    },

    zero_all: function () {
      for (var axis of 'xyzabc') {
        if (this[axis].enabled) {
          this.zero(axis);
        }
      }
    },

    zero: function (axis) {
      if (typeof axis == 'undefined') {
        this.zero_all();
      } else {
        this.set_position(axis, 0);
      }
    },

    start_pause: function () {
      if (this.state.xx == 'RUNNING') {
        this.pause();
      } else if (this.state.xx == 'STOPPING' || this.state.xx == 'HOLDING') {
        this.unpause();
      } else {
        this.start();
      }
    },

    start: function () {
      api.put('start')
    },

    pause: function () {
      api.put('pause')
    },

    unpause: function () {
      api.put('unpause')
    },

    optional_pause: function () {
      api.put('pause/optional')
    },

    stop: function () {
      api.put('stop')
    },

    step: function () {
      api.put('step')
    },

    override_feed: function () {
      api.put('override/feed/' + this.feed_override)
    },

    override_speed: function () {
      api.put('override/speed/' + this.speed_override)
    },

    current: function (axis, value) {
      var x = value / 32.0;
      if (this.state[axis + 'pl'] == x) {
        return;
      }

      var data = {};
      data[axis + 'pl'] = x;
      this.send(JSON.stringify(data));
    },

    showProbeDialog: function (probeType) {
      SvelteComponents.showDialog("Probe", { probeType });
    }
  },

  mixins: [require('./axis-vars')]
}
