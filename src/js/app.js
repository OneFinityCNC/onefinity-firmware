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
const cookie = require('./cookie')('bbctrl-');
const Sock = require('./sock');
const omit = require('lodash.omit');

function is_newer_version(current, latest) {
  const pattern = /(\d+)\.(\d+)\.(\d+)(.*)/;
  const currentParts = current.match(pattern);
  const latestParts = latest.match(pattern);

  if (!currentParts || !latestParts) {
    return false;
  }

  // Normal version comparisons
  const major = latestParts[1] - currentParts[1];
  const minor = latestParts[2] - currentParts[2];
  const patch = latestParts[3] - currentParts[3];

  // If current is a pre-release, and latest is a release
  const betaToRelease = latestParts[4].length === 0 && currentParts[4].length > 0;

  switch (true) {
    case major > 0:
    case major === 0 && minor > 0:
    case major === 0 && minor === 0 && patch > 0:
    case major === 0 && minor === 0 && patch === 0 && betaToRelease:
      return true;

    default:
      return false;
  }
}

function is_object(o) { return o !== null && typeof o == 'object' }
function is_array(o) { return Array.isArray(o) }

function update_array(dst, src) {
  while (dst.length) dst.pop()
  for (var i = 0; i < src.length; i++)
    Vue.set(dst, i, src[i]);
}


function update_object(dst, src, remove) {
  var props, index, key, value;

  if (remove) {
    props = Object.getOwnPropertyNames(dst);

    for (index in props) {
      key = props[index];
      if (!src.hasOwnProperty(key))
        Vue.delete(dst, key);
    }
  }

  props = Object.getOwnPropertyNames(src);
  for (index in props) {
    key = props[index];
    value = src[key];

    if (is_array(value) && dst.hasOwnProperty(key) && is_array(dst[key]))
      update_array(dst[key], value);

    else if (is_object(value) && dst.hasOwnProperty(key) && is_object(dst[key]))
      update_object(dst[key], value, remove);

    else Vue.set(dst, key, value);
  }
}

module.exports = new Vue({
  el: 'body',


  data: function () {
    return {
      status: 'connecting',
      currentView: 'loading',
      index: -1,
      modified: false,
      template: require('../resources/config-template.json'),
      config: {
        settings: { units: 'METRIC' },
        motors: [{}, {}, {}, {}],
        version: '<loading>',
        full_version: '<loading>'
      },
      state: {
        messages: [],
        probing_active: false,
        wait_for_probing_complete: false,
        show_probe_complete_modal: false,
        show_probe_failed_modal: false
      },
      video_size: cookie.get('video-size', 'small'),
      crosshair: cookie.get('crosshair', 'false') != 'false',
      errorTimeout: 30,
      errorTimeoutStart: 0,
      errorShow: false,
      errorMessage: '',
      confirmUpgrade: false,
      confirmUpload: false,
      firmwareUpgrading: false,
      checkedUpgrade: false,
      firmwareName: '',
      latestVersion: '',
      ipAddress: '0.0.0.0',
      wifiSSID: '',
      confirmShutdown: false,
      diskSpace: ''
    }
  },

  components: {
    'estop': { template: '#estop-template' },
    'loading-view': { template: '<h1>Loading...</h1>' },
    'control-view': require('./control-view'),
    'editor-view': require('./view-editor'),
    'settings-view': require('./settings-view'),
    'files-view': require('./view-files'),
    'motor-view': require('./motor-view'),
    'tool-view': require('./tool-view'),
    'io-view': require('./io-view'),
    'macros-view': require('./macros-view'),
    'admin-general-view': require('./admin-general-view'),
    'admin-network-view': require('./admin-network-view'),
    'help-view': { template: '#help-view-template' },
    'cheat-sheet-view': {
      template: '#cheat-sheet-view-template',
      data: function () { return { showUnimplemented: false } }
    }
  },

  events: {
    'config-changed': function () {
      this.modified = true;
    },

    'hostname-changed': function (hostname) {
      this.hostname = hostname
    },

    send: function (msg) {
      if (this.status == 'connected') {
        console.debug('>', msg);
        this.sock.send(msg);
      }
    },

    connected: function () {
      this.update()
    },

    update: function () {
      this.update()
    },

    check: function () {
      this.latestVersion = '';

      $.ajax({
        type: 'GET',
        url: 'https://raw.githubusercontent.com/OneFinityCNC/onefinity-release/master/latest.txt',
        data: { hid: this.state.hid },
        cache: false

      }).done(function (data) {
        this.latestVersion = data;
        this.$broadcast('latest_version', data);
      }.bind(this))
    },

    upgrade: function () {
      this.confirmUpgrade = true;
    },

    upload: function (firmware) {
      this.firmware = firmware;
      this.firmwareName = firmware.name;
      this.confirmUpload = true;
    },

    error: function (msg) {
      // Honor user error blocking
      if (Date.now() - this.errorTimeoutStart < this.errorTimeout * 1000)
        return;

      // Wait at least 1 sec to pop up repeated errors
      if (1 < msg.repeat && Date.now() - msg.ts < 1000) {
        return;
      }

      // Popup error dialog
      this.errorShow = true;
      this.errorMessage = msg.msg;
    }
  },

  computed: {
    popupMessages: function () {
      const msgs = [];

      for (let i = 0; i < this.state.messages.length; i++) {
        const text = this.state.messages[i].text;
        if (!/^#/.test(text)) {
          msgs.push(text);
        }
      }

      return msgs;
    }
  },

  ready: function () {
    $(window).on('hashchange', this.parse_hash);
    this.connect();
  },

  methods: {
    metric: function () {
      return this.config.settings.units != 'IMPERIAL'
    },

    file_dialog:    function (config) {this.$refs.fileDialog.open(config)},
    upload:         function (config) {this.$refs.uploader.upload(config)},
    open_dialog:    function (config) {this.$refs.dialog.open(config)},
    error_dialog:   function (msg)    {this.$refs.dialog.error(msg)},
    warning_dialog: function (msg)    {this.$refs.dialog.warning(msg)},
    success_dialog: function (msg)    {this.$refs.dialog.success(msg)},
    edit: function (path) {
      cookie.set('selected-path', path);
      location.hash = 'editor';
    },
    block_error_dialog: function () {
      this.errorTimeoutStart = Date.now();
      this.errorShow = false;
    },

    toggle_video: function (e) {
      if (this.video_size == 'small') this.video_size = 'large';
      else if (this.video_size == 'large') this.video_size = 'small';
      cookie.set('video-size', this.video_size);
    },

    toggle_crosshair: function (e) {
      e.preventDefault();
      this.crosshair = !this.crosshair;
      cookie.set('crosshair', this.crosshair);
    },

    estop: function () {
      if (this.state.xx == 'ESTOPPED') api.put('clear');
      else api.put('estop');
    },

    upgrade_confirmed: async function () {
      this.confirmUpgrade = false;

      try {
        await api.put('upgrade');
        this.firmwareUpgrading = true;
      } catch (err) {
        api.alert('Error during upgrade.');
        console.error("Error during upgrade", err);
      }
    },

    upload_confirmed: function () {
      this.confirmUpload = false;

      const form = new FormData();
      form.append('firmware', this.firmware);

      $.ajax({
        url: '/api/firmware/update',
        type: 'PUT',
        data: form,
        cache: false,
        contentType: false,
        processData: false

      }).success(function () {
        this.firmwareUpgrading = true;
      }.bind(this)).error(function (err) {
        api.alert('Firmware update failed');
        console.error('Firmware update failed', err);
      }.bind(this))
    },

    show_upgrade: function () {
      if (!this.latestVersion) return false;
      return is_newer_version(this.config.version, this.latestVersion);
    },

    update: function () {
      api.get('config/load').done(function (config) {
        update_object(this.config, config, true);
        this.parse_hash();

        if (!this.checkedUpgrade) {
          this.checkedUpgrade = true;

          var check = this.config.admin['auto-check-upgrade'];
          if (typeof check == 'undefined' || check)
            this.$emit('check');
        }

        this.check_ip_address();
        this.check_ssid();
      }.bind(this))
    },

    check_ip_address: function () {
      $.ajax({
        type: 'GET',
        url: 'hostinfo.txt',
        data: { hid: this.state.hid },
        cache: false

      }).done(function (data) {
        console.debug('>', data);
        this.ipAddress = 'IP:' + data;
        this.$broadcast('ipAddress', data);
      }.bind(this))
    },

    check_ssid: function () {
      $.ajax({
        type: 'GET',
        url: 'ssidinfo.txt',
        data: { hid: this.state.hid },
        cache: false

      }).done(function (data) {
        console.debug('>', data);
        this.wifiSSID = 'SSID:' + data;
        this.$broadcast('wifiSSID', data);
      }.bind(this))
    },

    get_ip_address: function () {
      console.debug('get_ip>', this.ipAddress);
      return this.ipAddress;
    },

    get_ssid: function () {
      console.debug('get_ssid>', this.wifiSSID);
      return this.wifiSSID;
    },

    shutdown: function () {
      this.confirmShutdown = false;
      api.put('shutdown');

    },

    reboot: function () {
      this.confirmShutdown = false;
      api.put('reboot');
    },

    connect: function () {
      this.sock = new Sock(`//${location.host}/sockjs`);

      this.sock.onmessage = (e) => {
        if (typeof e.data != 'object') {
          return;
        }

        if ('log' in e.data) {
          if (e.data.log.msg === "Switch not found") {
            this.$broadcast('probing_failed');
          } else {
            this.$broadcast('log', e.data.log);
          }

          delete e.data.log;
        }

        // Check for session ID change on controller
        if ('sid' in e.data) {
          if (typeof this.sid == 'undefined') {
            this.sid = e.data.sid;
          } else if (this.sid != e.data.sid) {
            if (typeof this.hostname !== 'undefined' && location.hostname !== 'localhost') {
              location.hostname = this.hostname;
            }

            location.reload();
          }
        }

        // Set this to true to get console output of changes to the state
        const debugStateChanges = false;
        if (debugStateChanges) {
          const data = omit(e.data, [
            'vdd',
            'vin',
            'vout',
            'motor',
            'temp',
            'heartbeat',
            'load1',
            'load2',
            'rpi_temp'
          ]);
          if (Object.keys(data).length > 0) {
            console.log(JSON.stringify(data, null, 4));
          }
        }

        update_object(this.state, e.data, false);

        if (this.state.pw === 0) {
          Vue.set(this.state, "saw_probe_connected", true);
        }

        if (this.state.cycle === 'idle') {
          if (this.state.wait_for_probing_complete) {
            Vue.set(this.state, "wait_for_probing_complete", false);
            this.$broadcast("probing_complete");
          }
        }

        this.$broadcast('update');
      };

      this.sock.onopen = () => {
        this.status = 'connected';
        this.$emit(this.status);
        this.$broadcast(this.status);
      };

      this.sock.onclose = () => {
        this.status = 'disconnected';
        this.$emit(this.status);
        this.$broadcast(this.status);
      };
    },

    parse_hash: function () {
      var hash = location.hash.substr(1);

      if (!hash.trim().length) {
        location.hash = 'control';
        return;
      }

      var parts = hash.split(':');

      if (parts.length == 2) this.index = parts[1];

      this.currentView = parts[0];
    },

    save: function () {
      const selected_tool = this.config.tool['selected-tool'];
      const saveModbus = selected_tool !== "pwm" &&
        selected_tool !== "laser" &&
        selected_tool !== "router";
      const settings = {
        ['tool']: { ...this.config.tool },
        ['pwm-spindle']: { ...this.config['pwm-spindle'] },
        ['modbus-spindle']: saveModbus ? { ...this.config['modbus-spindle'] } : undefined
      }
      delete settings.tool['tool-type'];

      this.config['selected-tool-settings'][selected_tool] = settings;

      api.put('config/save', this.config).done(function (data) {
        this.modified = false;
      }.bind(this)).fail(function (error) {
        api.alert('Save failed', error);
      });
    },

    close_messages: function (action) {
      if (action == 'stop') api.put('stop');
      if (action == 'continue') api.put('unpause');

      // Acknowledge messages
      if (this.state.messages.length) {
        var id = this.state.messages.slice(-1)[0].id
        api.put('message/' + id + '/ack');
      }
    },

    api_error: function (msg, error) {
      if (error != undefined) {
        if (error.message != undefined)
          msg += '\n' + error.message;
        else msg += '\n' + JSON.stringify(error);
      }

      this.error_dialog(msg);
    },
  }
})
