/******************************************************************************\

                 This file is part of the Buildbotics firmware.

                   Copyright (c) 2015 - 2018, Buildbotics LLC
                              All rights reserved.

      This file ("the software") is free software: you can redistribute it
      and/or modify it under the terms of the GNU General Public License,
       version 2 as published by the Free Software Foundation. You should
       have received a copy of the GNU General Public License, version 2
      along with the software. If not, see <http://www.gnu.org/licenses/>.

      The software is distributed in the hope that it will be useful, but
           WITHOUT ANY WARRANTY; without even the implied warranty of
       MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
                Lesser General Public License for more details.

        You should have received a copy of the GNU Lesser General Public
                 License along with the software.  If not, see
                        <http://www.gnu.org/licenses/>.

                 For information regarding this software email:
                   "Joseph Coffland" <joseph@buildbotics.com>

\******************************************************************************/

'use strict'

const api = require('./api');

module.exports = {
  template: '#control-view-template',
  props: ['config', 'template', 'state'],

  data: function () {
    return {
      mach_units: 'METRIC',
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
      axis_position: 0,
      deleteGCode: false,
      tab: 'auto',
      jog_incr: 1.0,
      tool_diameter: 6.35,
      tool_diameter_for_prompt: 6.35,
      show_probe_test_modal: false,
      show_tool_diameter_modal: false,
      toolpath_msg: {
        x: false,
        y: false,
        z: false,
        a: false,
        b: false,
        c: false
      },
      ask_home: true,
      ask_home_msg: false,
      ask_zero_xy_msg: false,
      ask_zero_z_msg: false,
      showGcodeMessage: false
    }
  },

  components: {
    'path-viewer': require('./path-viewer'),
    'gcode-viewer': require('./gcode-viewer')
  },


  watch: {
    'state.imperial': {
      handler: function (imperial) {
        this.mach_units = imperial ? 'IMPERIAL' : 'METRIC';
      },
      immediate: true
    },
    
    'state.bitDiameter': {
      handler: function (bitDiameter) {
          this.tool_diameter = bitDiameter;
      },
      immediate: true
    },


    mach_units: function (units) {
      if ((units == 'METRIC') != this.metric)
        this.send(units == 'METRIC' ? 'G21' : 'G20');

        this.units_changed();
    },

    'state.line': function () {
      if (this.mach_state != 'HOMING')
        this.$broadcast('gcode-line', this.state.line);
    },

    'state.selected_time': function () {
      this.load();
    }
  },


  computed: {
    metric: function () {
      return !this.state.imperial;
    },


    mach_state: function () {
      var cycle = this.state.cycle;
      var state = this.state.xx;

      if (typeof cycle != 'undefined' && state != 'ESTOPPED' &&
          (cycle == 'jogging' || cycle == 'homing'))
        return cycle.toUpperCase();
      return state || ''
    },


    pause_reason: function () {return this.state.pr},


    is_running: function () {
      return this.mach_state == 'RUNNING' || this.mach_state == 'HOMING';
    },


    is_stopping: function () {return this.mach_state == 'STOPPING'},
    is_holding: function () {return this.mach_state == 'HOLDING'},
    is_ready: function () {return this.mach_state == 'READY'},
    is_idle: function () {return this.state.cycle == 'idle'},


    is_paused: function () {
      return this.is_holding &&
        (this.pause_reason == 'User pause' ||
         this.pause_reason == 'Program pause')
    },


    can_mdi: function () {return this.is_idle || this.state.cycle == 'mdi'},


    can_set_axis: function () {
      return this.is_idle
      // TODO allow setting axis position during pause
      return this.is_idle || this.is_paused
    },


    message: function () {
      if (this.mach_state == 'ESTOPPED') return this.state.er;
      if (this.mach_state == 'HOLDING') return this.state.pr;
      if (this.state.messages.length)
        return this.state.messages.slice(-1)[0].text;
      return '';
    },


    highlight_state: function () {
      return this.mach_state == 'ESTOPPED' || this.mach_state == 'HOLDING';
    },


    plan_time: function () {return this.state.plan_time},


    plan_time_remaining: function () {
      if (!(this.is_stopping || this.is_running || this.is_holding)) return 0;
      return this.toolpath.time - this.plan_time
    },


    eta: function () {
      if (this.mach_state != 'RUNNING') return '';
      var remaining = this.plan_time_remaining;
      var d = new Date();
      d.setSeconds(d.getSeconds() + remaining);
      return d.toLocaleString();
    },


    progress: function () {
      if (!this.toolpath.time || this.is_ready) return 0;
      var p = this.plan_time / this.toolpath.time;
      return p < 1 ? p : 1;
    }
  },


  events: {
    probing_complete: function() {
      if (this.config.settings['probing-prompts']) {
        Vue.set(this.state, "show_probe_complete_modal", true);
      } else {
        this.$emit("finalize_probe");
      }
    },

    finalize_probe: function() {
      Vue.set(this.state, "show_probe_complete_modal", false);

      if (this.state.goto_xy_zero_after_probe) {
        this.goto_zero(1, 1, 0, 0);
      }

      Vue.set(this.state, "goto_xy_zero_after_probe", false);
    }
  },


  ready: function () {
    this.load()
  },


  methods: {
    units_changed : function() {
      if(this.mach_units == 'METRIC') {
        document.getElementById("jog_button_fine").innerHTML = "0.1";
        document.getElementById("jog_button_small").innerHTML = "1.0";
        document.getElementById("jog_button_medium").innerHTML = "10";
        document.getElementById("jog_button_large").innerHTML = "100";
      } else {
        document.getElementById("jog_button_fine").innerHTML = "0.005";
        document.getElementById("jog_button_small").innerHTML = "0.05";
        document.getElementById("jog_button_medium").innerHTML = "0.5";
        document.getElementById("jog_button_large").innerHTML = "5";
      }

      this.set_jog_incr('small');
    },

    start_probe_test: function(on_finish) {
      if (!this.config.settings['probing-prompts']) {
        on_finish();
        return;
      }

      this.show_probe_test_modal = true;
      Vue.set(this.state, "saw_probe_connected", false);
      Vue.set(this.state, "on_probe_finish", on_finish);
    },

    finish_probe_test: function() {
      this.show_probe_test_modal = false;
      Vue.set(this.state, "saw_probe_connected", false);

      const on_finish = this.state.on_probe_finish;
      Vue.set(this.state, "on_probe_finish", undefined);

      on_finish();
    },

    prep_and_show_tool_diameter_modal() {
      this.tool_diameter_for_prompt = (this.mach_units == 'METRIC')
          ? this.tool_diameter
          : this.tool_diameter / 25.4;

      this.tool_diameter_for_prompt = this.tool_diameter_for_prompt.toFixed(3).replace(/0+$/, "");

      this.show_tool_diameter_modal = true;
    },

    set_tool_diameter() {
      this.tool_diameter = parseFloat(this.tool_diameter_for_prompt);

      if (!isFinite(this.tool_diameter)) {
        return;
      }

      this.show_tool_diameter_modal = false;

      if (this.mach_units !== "METRIC") {
        this.tool_diameter *= 25.4;
      }
      
      this.probe_xyz();
    },

    probe(zOnly = false) {
      const xdim = this.config.probe["probe-xdim"];
      const ydim = this.config.probe["probe-ydim"];
      const zdim = this.config.probe["probe-zdim"];
      const slowSeek = this.config.probe["probe-slow-seek"];
      const fastSeek = this.config.probe["probe-fast-seek"];

      const zlift = 1;
      const xoffset = xdim + (this.tool_diameter / 2.0);
      const yoffset = ydim + (this.tool_diameter / 2.0);
      const zoffset = zdim;

      const metric = this.mach_units == "METRIC";
      const mm = n => (metric ? n : n / 25.4).toFixed(5);
      const speed = s => `F${mm(s)}`;

      // After probing Z, we want to drop the bit down:
      // Ideally, 12.7mm/0.5in
      // And we don't want to be more than 75% down on the probe block
      // Also, add zlift to compensate for the fact that we lift after probing Z
      const plunge = Math.min(12.7, zoffset * 0.75) + zlift;

      Vue.set(this.state, "goto_xy_zero_after_probe", !zOnly);

      if (zOnly) {
        this.send(`
          ${metric ? "G21" : "G20"}
          G92 Z0
        
          G38.2 Z ${mm(-25.4)} ${speed(fastSeek)}
          G91 G1 Z ${mm(1)}
          G38.2 Z ${mm(-2)} ${speed(slowSeek)}
          G92 Z ${mm(zoffset)}
        
          G91 G0 Z ${mm(3)}

          M2
        `);
      } else {
        this.send(`
          ${metric ? "G21" : "G20"}
          G92 X0 Y0 Z0
          
          G38.2 Z ${mm(-25.4)} ${speed(fastSeek)}
          G91 G1 Z ${mm(1)}
          G38.2 Z ${mm(-2)} ${speed(slowSeek)}
          G92 Z ${mm(zoffset)}
        
          G91 G0 Z ${mm(zlift)}
          G91 G0 X ${mm(20)}
          G91 G0 Z ${mm(-plunge)}
          G38.2 X ${mm(-20)} ${speed(fastSeek)}
          G91 G1 X ${mm(1)}
          G38.2 X ${mm(-2)} ${speed(slowSeek)}
          G92 X ${mm(xoffset)}

          G91 G0 X ${mm(1)}
          G91 G0 Y ${mm(20)}
          G91 G0 X ${mm(-20)}
          G38.2 Y ${mm(-20)} ${speed(fastSeek)}
          G91 G1 Y ${mm(1)}
          G38.2 Y ${mm(-2)} ${speed(slowSeek)}
          G92 Y ${mm(yoffset)}

          G91 G0 Y ${mm(3)}
          G91 G0 Z ${mm(25.4)}

          M2
        `);
      }

      // Wait 1 second to let the probing sequence begin,
      // then wait for probing to be complete
      setTimeout(() => Vue.set(this.state, "wait_for_probing_complete", true), 1000);
    },

    probe_xyz() {
      this.probe(false);
    },

    probe_z() {
      this.probe(true);
    },

    set_jog_incr: function(newValue) {
      document.getElementById("jog_button_fine").style.fontWeight = 'normal';
      document.getElementById("jog_button_small").style.fontWeight = 'normal';
      document.getElementById("jog_button_medium").style.fontWeight = 'normal';
      document.getElementById("jog_button_large").style.fontWeight = 'normal';

      if (newValue == 'fine') {
        document.getElementById("jog_button_fine").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 0.1;
        else
          this.jog_incr = 0.005;
      } else if (newValue == 'small') {
        document.getElementById("jog_button_small").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 1.0;
        else
          this.jog_incr = 0.05;
      } else if (newValue == 'medium') {
        document.getElementById("jog_button_medium").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 10;
        else
          this.jog_incr = 0.5;
      } else if (newValue == 'large') {
        document.getElementById("jog_button_large").style.fontWeight = 'bold';

        this.jog_incr = (this.mach_units == 'METRIC')
          ? 100
          : 5;
      }
    },

    goto_zero(x, y, z, a) {
      this.ask_zero_xy_msg = false;
      this.ask_zero_z_msg = false;

      const axes = [
        x ? "X0" : "",
        y ? "Y0" : "",
        z ? "Z0" : "",
        a ? "A0" : ""
      ];

      api.put('jog', {
        ts: Date.now(),
        mode: 'line',
        gcode: `G90\nG0 ${axes.join(" ")}`
      });
    },

    jog_line: function (x, y, z, a) {
      const axes = [
        x ? `X${x * this.jog_incr}` : "",
        y ? `Y${y * this.jog_incr}` : "",
        z ? `Z${z * this.jog_incr}` : "",
        a ? `A${a * this.jog_incr}` : ""
      ];

      api.put('jog', {
        ts: Date.now(),
        mode: 'line',
        gcode: `G91\nG0 ${axes.join(" ")}`
      });
    },

    send: function (msg) {
      this.$dispatch('send', msg)
    },

    load: function () {
      var file_time = this.state.selected_time;
      var file = this.state.selected;
      if (this.last_file == file && this.last_file_time == file_time) return;
      this.last_file = file;
      this.last_file_time = file_time;

      this.$broadcast('gcode-load', file);
      this.$broadcast('gcode-line', this.state.line);
      this.toolpath_progress = 0;
      this.load_toolpath(file, file_time);
    },


    load_toolpath: async function (file, file_time) {
      this.toolpath = {};

      if (!file) return;
      if (this.last_file_time != file_time) return;

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
      if (!this.history.length || this.history[0] != this.mdi)
        this.history.unshift(this.mdi);
      this.mdi = '';
    },


    mdi_start_pause: function () {
      if (this.state.xx == 'RUNNING') this.pause();

      else if (this.state.xx == 'STOPPING' || this.state.xx == 'HOLDING')
        this.unpause();

      else this.submit_mdi();
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

      const fd = new FormData();

      fd.append('gcode', file);

      try {
        await api.upload('file', fd);

        this.last_file_time = undefined; // Force reload
        this.$broadcast('gcode-reload', file.name);
      } catch (err) {
        api.alert('Upload failed', err)
      }
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
      this.ask_home_msg = false;     
      
      if (typeof axis == 'undefined') api.put('home');

      else {
        if (this[axis].homingMode != 'manual') api.put('home/' + axis);
        else this.manual_home[axis] = true;
      }
    },


    set_home: function (axis, position) {
      this.manual_home[axis] = false;
      api.put('home/' + axis + '/set', {position: parseFloat(position)});
    },


    unhome: function (axis) {
      this.position_msg[axis] = false;
      api.put('home/' + axis + '/clear');
    },


    show_set_position: function (axis) {
      this.axis_position = 0;
      this.position_msg[axis] = true;
    },
    
    show_toolpath_msg : function(axis) {
      this.toolpath_msg[axis] = true;
    },


    set_position: function (axis, position) {
      this.position_msg[axis] = false;
      api.put('position/' + axis, {'position': parseFloat(position)});
    },


    zero_all: function () {
      for (var axis of 'xyzabc')
        if (this[axis].enabled) this.zero(axis);
    },


    zero: function (axis) {
      if (typeof axis == 'undefined') this.zero_all();
      else this.set_position(axis, 0);
    },


    start_pause: function () {
      if (this.state.xx == 'RUNNING') this.pause();

      else if (this.state.xx == 'STOPPING' || this.state.xx == 'HOLDING')
        this.unpause();

      else this.start();
    },


    start: function () {api.put('start')},
    pause: function () {api.put('pause')},
    unpause: function () {api.put('unpause')},
    optional_pause: function () {api.put('pause/optional')},
    stop: function () {api.put('stop')},
    step: function () {api.put('step')},


    override_feed: function () {api.put('override/feed/' + this.feed_override)},


    override_speed: function () {
      api.put('override/speed/' + this.speed_override)
    },


    current: function (axis, value) {
      var x = value / 32.0;
      if (this.state[axis + 'pl'] == x) return;

      var data = {};
      data[axis + 'pl'] = x;
      this.send(JSON.stringify(data));
    }
  },


  mixins: [require('./axis-vars')]
}
