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

var api    = require('./api');
var cookie = require('./cookie')('bbctrl-');


function _is_array(x) {
  return Object.prototype.toString.call(x) === '[object Array]';
}


function escapeHTML(s) {
  var entityMap = {'&': '&amp;', '<': '&lt;', '>': '&gt;'};
  return String(s).replace(/[&<>]/g, function (s) {return entityMap[s];});
}


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
      manual_home: {x: false, y: false, z: false, a: false, b: false, c: false},
      position_msg: {x: false, y: false, z: false, a: false, b: false, c: false},
      axis_position: 0,
      jog_step: cookie.get_bool('jog-step'),
      jog_adjust: parseInt(cookie.get('jog-adjust', 2)),
      deleteGCode: false,
      tab: 'auto',
      jog_incr: 1.0,
      tool_msg: false,
      tool_diameter: 6.35,
      toolpath_msg: {x: false, y: false, z: false, a: false, b: false, c: false},
      ask_home: true,
      ask_home_msg: false,
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
    'state.imperial': {
      handler: function (imperial) {
        this.mach_units = imperial ? 'IMPERIAL' : 'METRIC';
      },
      immediate: true
    },
    
    'state.bitDiameter': {
      handler: function (bitDiameter) {
        console.log("New bitDiameter " + bitDiameter);
        console.log("Units: " + this.mach_units);
        if(this.mach_units == 'IMPERIAL')
          this.tool_diameter = bitDiameter / 25.4;
        else
          this.tool_diameter = bitDiameter;
        console.log("Tool diameter: " + this.tool_diameter);
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


    'state.selected_time': function () {this.load()},
    jog_step: function () {cookie.set_bool('jog-step', this.jog_step)},
    jog_adjust: function () {cookie.set('jog-adjust', this.jog_adjust)}
  },


  computed: {
    metric: function () {return !this.state.imperial},


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
    jog: function (axis, power) {
      var data = {ts: new Date().getTime()};
      data[axis] = power;
      api.put('jog', data);
    },

    back2zero: function(axis0,axis1) {
      this.send("G0"+axis0+"0"+axis1+"0");
    },

    step: function (axis, value) {
      this.send('M70\nG91\nG0' + axis + value + '\nM72');
    }
  },


  ready: function () {this.load()},


  methods: {

    units_changed : function() {
      console.log("Units changed!");

      if(this.mach_units == 'METRIC') {
        document.getElementById("jog_button_fine").innerHTML = "0.1";
        document.getElementById("jog_button_small").innerHTML = "1.0";
        document.getElementById("jog_button_medium").innerHTML = "10";
        document.getElementById("jog_button_large").innerHTML = "100";
        this.tool_diameter = this.tool_diameter * 25.4;
        this.tool_diameter = this.tool_diameter.toFixed(3);
      } else {
        document.getElementById("jog_button_fine").innerHTML = "0.005";
        document.getElementById("jog_button_small").innerHTML = "0.05";
        document.getElementById("jog_button_medium").innerHTML = "0.5";
        document.getElementById("jog_button_large").innerHTML = "5";
        this.tool_diameter = this.tool_diameter / 25.4;
        this.tool_diameter = this.tool_diameter.toFixed(3);
      }

      this.set_jog_incr('small');

    },

    set_tool_diameter : function (new_diameter) {

      if(isNaN(new_diameter))
        return;

      this.tool_msg = false;

      this.tool_diameter = parseFloat(new_diameter);
      
      this.probe_xyz();

    },

    set_jog_incr: function(newValue) {
      //this.jog_incr = newValue;

      document.getElementById("jog_button_fine").style.fontWeight = 'normal';
      document.getElementById("jog_button_small").style.fontWeight = 'normal';
      document.getElementById("jog_button_medium").style.fontWeight = 'normal';
      document.getElementById("jog_button_large").style.fontWeight = 'normal';

      if(newValue == 'fine')
      {
        document.getElementById("jog_button_fine").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 0.1;
        else
          this.jog_incr = 0.005;
      } else if(newValue == 'small') {
        document.getElementById("jog_button_small").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 1.0;
        else
          this.jog_incr = 0.05;
      } else if(newValue == 'medium') {
        document.getElementById("jog_button_medium").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 10;
        else
          this.jog_incr = 0.5;
      } else if(newValue == 'large') {
        document.getElementById("jog_button_large").style.fontWeight = 'bold';
        if(this.mach_units == 'METRIC')
          this.jog_incr = 100;
        else
          this.jog_incr = 5;
      }



    },

    goto_zero(zero_x,zero_y,zero_z,zero_a) {
      var xcmd = "";
      var ycmd = "";
      var zcmd = "";
      var acmd = "";
      if(zero_x) xcmd = "X0";
      if(zero_y) ycmd = "Y0";
      if(zero_z) zcmd = "Z0";
      if(zero_a) acmd = "A0";

      this.ask_zero_xy_msg = false;
      this.ask_zero_z_msg = false;

      this.send('G90\nG0' + xcmd + ycmd + zcmd + acmd + '\n');
    },

    probe_xyz() {
      var pcmd = "";
      var xoffset = this.config.probe["probe-xdim"];
      var yoffset = this.config.probe["probe-ydim"];
      var zoffset = this.config.probe["probe-zdim"];
      var fastSeek = this.config.probe["probe-fast-seek"];
      var slowSeek = this.config.probe["probe-slow-seek"];
      debugger;

      if(this.mach_units == "METRIC") {
        
        fastSeek = "F" + fastSeek;
        slowSeek = "F" + slowSeek;
        
        //Metric Probing
        pcmd += "G92 X0\n";
        pcmd += "G92 Y0\n";
        pcmd += "G92 Z0\n";
        pcmd += "G21\n";
        pcmd += "G38.2 Z-25.4 " + fastSeek + "\n";
        pcmd += "G91 G0 Z1.5\n";
        pcmd += "G38.2 Z-2.5 " + slowSeek + "\n";
        
        //var zoffset = 16.383;
        pcmd += "G92 Z " + zoffset + "\n";
      
        pcmd += "G91 G0 Z 3.175\n";
        pcmd += "G91 G0 X 19.05\n";
        pcmd += "G91 G0 Z -12.7\n";
        pcmd += "G38.2 X -19.05 " + fastSeek + "\n";
        pcmd += "G91 G1 X 1.27 " + fastSeek +"\n";
        pcmd += "G38.2 X -4 " + slowSeek + "\n";

        xoffset += this.tool_diameter/2.0;
        xoffset = xoffset.toFixed(5);
        pcmd += "G92 X " + xoffset + "\n";

        pcmd += "G91 G0 X 2.5\n";
        pcmd += "G91 G0 Y 17\n";
        pcmd += "G91 G0 X -13\n";
        pcmd += "G38.2 Y -17 " + fastSeek + "\n";
        pcmd += "G91 G0 Y 1.27\n";
        pcmd += "G38.2 Y -4 " + slowSeek +"\n";

        yoffset += this.tool_diameter/2.0;
        yoffset = yoffset.toFixed(5);
        pcmd += "G92 Y " + yoffset + "\n";

        pcmd += "G91 G0 Y2.54\n";
        pcmd += "G91 G0 Z 25.4\n";
        pcmd += "G90 G0 X0 Y0\n";
      } else {

        //Imperial Probing
        
        xoffset = xoffset / 25.4;
        yoffset = yoffset / 25.4;
        zoffset = zoffset / 25.4;
        slowSeek = slowSeek / 25.4;
        slowSeek = slowSeek.toFixed(5);
        slowSeek = "F" + slowSeek;
        fastSeek = fastSeek / 25.4;
        fastSeek = fastSeek.toFixed(5);
        fastSeek = "F" + fastSeek;
        
        pcmd += "G92 X0\n";
        pcmd += "G92 Y0\n";
        pcmd += "G92 Z0\n";
        pcmd += "G20\n";
        pcmd += "G38.2 Z-1.0 " + fastSeek + "\n";
        pcmd += "G91 G0 Z0.06\n";
        pcmd += "G38.2 Z-0.1 " + slowSeek + "\n";
        
        //var zoffset = 0.645;
        zoffset = zoffset.toFixed(5);
        pcmd += "G92 Z " + zoffset + "\n";
        
      
        pcmd += "G91 G0 Z 0.125\n";
        pcmd += "G91 G0 X 0.75\n";
        pcmd += "G91 G0 Z -0.5\n";
        pcmd += "G38.2 X -0.75 " + fastSeek + "\n";
        pcmd += "G91 G1 X 0.05 " + fastSeek + "\n";
        pcmd += "G38.2 X -0.15 " + slowSeek + "\n";

        xoffset +=  this.tool_diameter/2.0;
        xoffset = xoffset.toFixed(5);
        pcmd += "G92 X " + xoffset + "\n";

        pcmd += "G91 G0 X 0.1\n";
        pcmd += "G91 G0 Y 0.75\n";
        pcmd += "G91 G0 X -0.5\n";
        pcmd += "G38.2 Y -0.75 " + fastSeek + "\n";
        pcmd += "G91 G0 Y 0.05\n";
        pcmd += "G38.2 Y -0.15 " + slowSeek +"\n";

        yoffset += this.tool_diameter/2.0;
        yoffset = yoffset.toFixed(5);
        pcmd += "G92 Y " + yoffset + "\n";

        pcmd += "G91 G0 Y0.1\n";
        pcmd += "G91 G0 Z1\n";
        pcmd += "G90 G0 X0 Y0\n";
      }

      this.send(pcmd);

    },

    probe_z() {
      var pcmd = "";
      var fastSeek = this.config.probe["probe-fast-seek"];
      var slowSeek = this.config.probe["probe-slow-seek"];
      var zoffset = this.config.probe["probe-zdim"];

      debugger;    

      if(this.mach_units == "METRIC") {
        fastSeek = "F" + fastSeek;
        slowSeek = "F" + slowSeek;
        
        
        pcmd += "G92 Z0\n";
        pcmd += "G21\n";
        pcmd += "G38.2 Z-25 " + fastSeek + "\n";
        pcmd += "G91 G0 Z1.5\n";
        pcmd += "G38.2 Z-2.5 " + slowSeek + "\n";
        pcmd += "G92 Z " + zoffset + "\n";
        pcmd += "G91 G0 Z3\n";
      

      }  else {
        zoffset = zoffset / 25.4;
        slowSeek = slowSeek / 25.4;
        slowSeek = slowSeek.toFixed(5);
        slowSeek = "F" + slowSeek;
        fastSeek = fastSeek / 25.4;
        fastSeek = fastSeek.toFixed(5);
        fastSeek = "F" + fastSeek;
        
        pcmd += "G92 Z0\n";
        pcmd += "G20\n";
        pcmd += "G38.2 Z-1.0 " + fastSeek +"\n";
        pcmd += "G91 G0 Z0.06\n";
        pcmd += "G38.2 Z-0.1 " + slowSeek + "\n";
        zoffset = zoffset.toFixed(5);
        pcmd += "G92 Z " + zoffset + "\n";
        pcmd += "G91 G0 Z0.125\n";
      
      }
      
      this.send(pcmd);

    },

    jog_fn: function (x_jog,y_jog,z_jog,a_jog) {
      var xcmd = "X" + x_jog * this.jog_incr;
      var ycmd = "Y" + y_jog * this.jog_incr;
      var zcmd = "Z" + z_jog * this.jog_incr;
      var acmd = "A" + a_jog * this.jog_incr;

      console.log("Jog command: " + this.jog_incr);
      //debugger;

      this.send('G91\nG0' + xcmd + ycmd + zcmd + acmd + '\n');
    },

    send: function (msg) {this.$dispatch('send', msg)},


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


    load_toolpath: function (file, file_time) {
      this.toolpath = {};

      if (!file) return;

      api.get('path/' + file).done(function (toolpath) {
        if (this.last_file_time != file_time) return;

        if (typeof toolpath.progress == 'undefined') {
          toolpath.filename = file;
          this.toolpath_progress = 1;
          this.showGcodeMessage = false;
          this.toolpath = toolpath;

          var state = this.$root.state;
          var bounds = toolpath.bounds;
          for (var axis of 'xyzabc') {
            Vue.set(state, 'path_min_' + axis, bounds.min[axis]);
            Vue.set(state, 'path_max_' + axis, bounds.max[axis]);
          }

        } else {
          this.showGcodeMessage = true;
          this.toolpath_progress = toolpath.progress;
          this.load_toolpath(file, file_time); // Try again
        }
      }.bind(this));
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


    load_history: function (index) {this.mdi = this.history[index];},


    open: function (e) {
      // If we don't reset the form the browser may cache file if name is same
      // even if contents have changed
      $('.gcode-file-input')[0].reset();
      $('.gcode-file-input input').click();
    },


    upload: function (e) {
      var files = e.target.files || e.dataTransfer.files;
      if (!files.length) return;

      var file = files[0];
      var fd = new FormData();

      fd.append('gcode', file);

      api.upload('file', fd)
        .done(function () {
          this.last_file_time = undefined; // Force reload
          this.$broadcast('gcode-reload', file.name);

        }.bind(this)).fail(function (error) {
          api.alert('Upload failed', error)
        }.bind(this));
    },


    delete_current: function () {
      if (this.state.selected)
        api.delete('file/' + this.state.selected);
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
