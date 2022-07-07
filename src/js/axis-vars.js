'use strict'

module.exports = {
  props: ['state', 'config'],

  computed: {
    metric: function () { this.$root.display_units === "METRIC" },
    x: function () { return this._compute_axis('x') },
    y: function () { return this._compute_axis('y') },
    z: function () { return this._compute_axis('z') },
    a: function () { return this._compute_axis('a') },
    b: function () { return this._compute_axis('b') },
    c: function () { return this._compute_axis('c') },
    axes: function () { return this._compute_axes() }
  },

  methods: {
    _convert_length: function (value) {
      return this.metric
        ? value
        : value / 25.4;
    },

    _length_str: function (value) {
      return this._convert_length(value).toLocaleString() +
        (this.metric ? ' mm' : ' in');
    },

    _compute_axis: function (axis) {
      var abs = this.state[axis + 'p'] || 0;
      var off = this.state['offset_' + axis];
      var motor_id = this._get_motor_id(axis);
      var motor = motor_id == -1 ? {} : this.config.motors[motor_id];
      var enabled = typeof motor.enabled != 'undefined' && motor.enabled;
      var homingMode = motor['homing-mode']
      var homed = this.state[motor_id + 'homed'];
      var min = this.state[motor_id + 'tn'];
      var max = this.state[motor_id + 'tm'];
      var dim = max - min;
      var pathMin = this.state['path_min_' + axis];
      var pathMax = this.state['path_max_' + axis];
      var pathDim = pathMax - pathMin;
      var under = pathMin + off < min;
      var over = max < pathMax + off;
      var klass = (homed ? 'homed' : 'unhomed') + ' axis-' + axis;
      var state = 'UNHOMED';
      var icon = 'question-circle';
      var fault = this.state[motor_id + 'df'] & 0x1f;
      var shutdown = this.state.power_shutdown;
      var title;
      var ticon = 'question-circle';
      var tstate = 'NO FILE';
      var toolmsg;
      var tklass = (homed ? 'homed' : 'unhomed') + ' axis-' + axis;

      if (fault || shutdown) {
        state = shutdown ? 'SHUTDOWN' : 'FAULT';
        klass += ' error';
        icon = 'exclamation-circle';
      } else if (homed) {
        state = 'HOMED';
        icon = 'check-circle';
      }

      if (0 < dim && dim < pathDim) {
        tstate = 'NO FIT';
        tklass += ' error';
        ticon = 'ban';
      } else {
        if (over || under) {
          tstate = over ? 'OVER' : 'UNDER';
          tklass += ' warn';
          ticon = 'exclamation-circle';
        } else {
          tstate = 'OK';
          ticon = 'check-circle';
        }
      }

      switch (state) {
        case 'UNHOMED': title = 'Click the home button to home axis.'; break;
        case 'HOMED': title = 'Axis successfuly homed.'; break;
        case 'FAULT':
          title = 'Motor driver fault.  A potentially damaging electrical ' +
            'condition was detected and the motor driver was shutdown.  ' +
            'Please power down the controller and check your motor cabling.  ' +
            'See the "Motor Faults" table on the "Indicators" tab for more ' +
            'information.';
          break;

        case 'SHUTDOWN':
          title = 'Motor power fault.  All motors in shutdown.  ' +
            'See the "Power Faults" table on the "Indicators" tab for more ' +
            'information.  Reboot controller to reset.';
      }

      switch (tstate) {
        case 'OVER':
          toolmsg = 'Caution: The current tool path file would move ' +
            this._length_str(pathMax + off - max) + ' above axis limit with the current offset.';
          break;

        case 'UNDER':
          toolmsg = 'Caution: The current tool path file would move ' +
            this._length_str(min - pathMin - off) + ' below limit with the current offset.';
          break;

        case 'NO FIT':
          toolmsg = 'Warning: The current tool path dimensions (' +
            this._length_str(pathDim) + ') exceed axis dimensions (' +
            this._length_str(dim) + ') by ' +
            this._length_str(pathDim - dim) + '.';
          break;

        default:
          toolmsg = 'Tool path ' + axis + ' dimensions OK.';
          break;
      }

      return {
        pos: abs - off,
        abs: abs,
        off: off,
        min: min,
        max: max,
        dim: dim,
        pathMin: pathMin,
        pathMax: pathMax,
        pathDim: pathDim,
        motor: motor_id,
        enabled: enabled,
        homingMode: homingMode,
        homed: homed,
        klass: klass,
        state: state,
        icon: icon,
        title: title,
        ticon: ticon,
        tstate: tstate,
        toolmsg: toolmsg,
        tklass: tklass
      }
    },

    _get_motor_id: function (axis) {
      for (var i = 0; i < this.config.motors.length; i++) {
        var motor = this.config.motors[i];
        if (motor.axis.toLowerCase() == axis) return i;
      }

      return -1;
    },

    _compute_axes: function () {
      var homed = false;

      for (var name of 'xyzabc') {
        var axis = this[name];

        if (!axis.enabled) continue
        if (!axis.homed) { homed = false; break }
        homed = true;
      }

      var error = false;
      var warn = false;

      if (homed)
        for (name of 'xyzabc') {
          axis = this[name];

          if (!axis.enabled) continue;
          if (axis.klass.indexOf('error') != -1) error = true;
          if (axis.klass.indexOf('warn') != -1) warn = true;
        }

      var klass = homed ? 'homed' : 'unhomed';
      if (error) klass += ' error';
      else if (warn) klass += ' warn';

      if (!homed && this.ask_home) {
        this.ask_home = false;
        SvelteComponents.showDialog("HomeMachine", {
          home: () => this.home()
        });
      }

      return {
        homed: homed,
        klass: klass
      }
    }
  }
}
