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

'use strict';

var api = require('./api');
var modbus = require('./modbus.js');

module.exports = {
  template: '#tool-view-template',
  props: ['config', 'template', 'state'],

  data: function () {
    return {
      address: 0,
      value: 0,
      toolList: [
        {
          id: "disabled",
          name: "Disabled"
        },
        {
          id: "router",
          type: "PWM Spindle",
          name: "Router (Makita, etc)"
        },
        {
          id: "laser",
          type: "PWM Spindle",
          name: "Laser (J Tech, etc)"
        },
        {
          id: "pwm",
          name: "PWM Spindle"
        },
        {
          id: "unsupported-separator",
          name: "Unsupported Tools",
          disabled: true,
          unsupported: true
        },
        {
          id: "huanyang-vfd",
          name: "Huanyang VFD",
          unsupported: true
        },
        {
          id: "custom-modbus-vfd",
          name: "Custom Modbus VFD",
          unsupported: true
        },
        {
          id: "ac-tech-vfd",
          name: "AC-Tech VFD",
          unsupported: true
        },
        {
          id: "nowforever-vfd",
          name: "Nowforever VFD",
          unsupported: true
        },
        {
          id: "delta-vfd",
          name: "Delta VFD015M21A (Beta)",
          unsupported: true
        },
        {
          id: "yl600-vfd",
          name: "YL600, YL620, YL620-A VFD (Beta)",
          unsupported: true
        },
        {
          id: "fr-d700-vfd",
          name: "FR-D700 (Beta)",
          unsupported: true
        },
        {
          id: "sunfar-e300-vfd",
          name: "Sunfar E300 (Beta)",
          unsupported: true
        },
        {
          id: "omron-mx2-vfd",
          name: "OMRON MX2",
          unsupported: true
        }
      ]
    }
  },

  components: {
    'modbus-reg': require('./modbus-reg.js')
  },

  watch: {
    'state.mr': function () { this.value = this.state.mr }
  },

  events: {
    'input-changed': function () {
      this.$dispatch('config-changed');
      return false;
    }
  },

  ready: function () {
    this.value = this.state.mr;
  },

  computed: {
    regs_tmpl: function () {
      return this.template['modbus-spindle'].regs;
    },

    tool_type: function () {
      return this.config.tool['tool-type'].toUpperCase();
    },

    selected_tool: function() {
      return this.config.tool['selected-tool'].toUpperCase();
    },

    is_pwm_spindle: function () {
      return this.selected_tool == 'PWM';
    },

    is_laser: function () {
      return this.selected_tool.includes("LASER");
    },

    is_router: function () {
      return this.selected_tool.includes("ROUTER");
    },

    is_modbus: function () {
      return this.tool_type != 'DISABLED' &&
        !this.is_pwm_spindle && !this.is_laser && !this.is_router;
    },

    modbus_status: function () {
      return modbus.status_to_string(this.state.mx);
    }
  },

  methods: {
    change_selected_tool: function(...args) {
      const tool = this.toolList.find(tool => tool.id == this.config.tool['selected-tool']);
      this.config.tool["tool-type"] = tool.type || tool.name;

      console.log(this.config.tool["tool-type"]);

      this.$dispatch("config-changed");
    },

    show_tool_settings: function (key) {
      switch (true) {
        case key === "tool-type":
        case key === "selected-tool":
          return false;

        case this.selected_tool === "DISABLED":
        case this.selected_tool.includes("LASER"):
          return false;

        case this.selected_tool.includes("ROUTER"):
          switch (key) {
            case "tool-enable-mode":
              return true;

            default:
              return false;
          }

        default:
          return true;
      }
    },

    get_reg_type: function (reg) {
      return this.regs_tmpl.template['reg-type'].values[this.state[reg + 'vt']];
    },

    get_reg_addr: function (reg) {
      return this.state[reg + 'va'];
    },

    get_reg_value: function (reg) {
      return this.state[reg + 'vv'];
    },

    get_reg_fails: function (reg) {
      var fails = this.state[reg + 'vr']
      return fails == 255 ? 'Max' : fails;
    },

    show_modbus_field: function (key) {
      return key != 'regs' &&
        (key != 'multi-write' || this.tool_type == 'CUSTOM MODBUS VFD');
    },

    read: function (e) {
      e.preventDefault();
      api.put('modbus/read', { address: this.address });
    },

    write: function (e) {
      e.preventDefault();
      api.put('modbus/write', { address: this.address, value: this.value });
    },

    customize: function (e) {
      e.preventDefault();
      this.config.tool['tool-type'] = 'Custom Modbus VFD';

      var regs = this.config['modbus-spindle'].regs;
      for (var i = 0; i < regs.length; i++) {
        var reg = this.regs_tmpl.index[i];
        regs[i]['reg-type'] = this.get_reg_type(reg);
        regs[i]['reg-addr'] = this.get_reg_addr(reg);
        regs[i]['reg-value'] = this.get_reg_value(reg);
      }

      this.$dispatch('config-changed');
    },

    clear: function (e) {
      e.preventDefault();
      this.config.tool['tool-type'] = 'Custom Modbus VFD';

      var regs = this.config['modbus-spindle'].regs;
      for (var i = 0; i < regs.length; i++) {
        regs[i]['reg-type'] = 'disabled';
        regs[i]['reg-addr'] = 0;
        regs[i]['reg-value'] = 0;
      }

      this.$dispatch('config-changed');
    },

    reset_failures: function (e) {
      e.preventDefault();
      var regs = this.config['modbus-spindle'].regs;
      for (var reg = 0; reg < regs.length; reg++)
        this.$dispatch('send', '\$' + reg + 'vr=0');
    }
  }
}
