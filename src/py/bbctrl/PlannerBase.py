################################################################################
#                                                                              #
#                This file is part of the Buildbotics firmware.                #
#                                                                              #
#                  Copyright (c) 2015 - 2018, Buildbotics LLC                  #
#                             All rights reserved.                             #
#                                                                              #
#     This file ("the software") is free software: you can redistribute it     #
#     and/or modify it under the terms of the GNU General Public License,      #
#      version 2 as published by the Free Software Foundation. You should      #
#      have received a copy of the GNU General Public License, version 2       #
#     along with the software. If not, see <http://www.gnu.org/licenses/>.     #
#                                                                              #
#     The software is distributed in the hope that it will be useful, but      #
#          WITHOUT ANY WARRANTY; without even the implied warranty of          #
#      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU       #
#               Lesser General Public License for more details.                #
#                                                                              #
#       You should have received a copy of the GNU Lesser General Public       #
#                License along with the software.  If not, see                 #
#                       <http://www.gnu.org/licenses/>.                        #
#                                                                              #
#                For information regarding this software email:                #
#                  "Joseph Coffland" <joseph@buildbotics.com>                  #
#                                                                              #
################################################################################


import json
import math
import re
import camotics.gplan as gplan # pylint: disable=no-name-in-module,import-error


reLogLine = re.compile(
    r'^(?P<level>[A-Z])[0-9 ]:'
    r'((?P<file>[^:]+):)?'
    r'((?P<line>\d+):)?'
    r'((?P<column>\d+):)?'
    r'(?P<msg>.*)$')


class PlannerBase():
    def __init__(self, ctrl, logger_name):
        self.ctrl = ctrl
        self.log = self.ctrl.log.get(logger_name)
        self.planner = None


    def _init_planner(self):
        self.planner = gplan.Planner()
        self.planner.set_resolver(self._get_var_cb)
        # TODO logger is global and will not work correctly in demo mode
        self.planner.set_logger(self._log_cb, 1, 'LinePlanner:3')


    @staticmethod
    def log_json(o):
        return json.dumps(PlannerBase.log_floats(o))


    @staticmethod
    def log_floats(o):
        if isinstance(o, float): return round(o, 2)
        if isinstance(o, dict): return {k: PlannerBase.log_floats(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)): return [PlannerBase.log_floats(x) for x in o]
        return o


    def _get_var_cb(self, name, units):
        value = 0

        if len(name) and name[0] == '_':
            value = self.ctrl.state.get(name[1:], 0)
            try:
                float(value)
                if units == 'IMPERIAL': value /= 25.4 # Assume metric
            except ValueError: value = 0

        self.log.info('Get: %s=%s (units=%s)' % (name, value, units))

        return value


    def _log_cb(self, line):
        line = line.strip()
        m = reLogLine.match(line)
        if not m: return

        level    = m.group('level')
        msg      = m.group('msg')
        filename = m.group('file')
        line     = m.group('line')
        column   = m.group('column')

        where = ':'.join(filter(None.__ne__, [filename, line, column]))

        if line is not None: line = int(line)
        if column is not None: column = int(column)

        if   level == 'I': self.log.info    (msg, where = where)
        elif level == 'D': self.log.debug   (msg, where = where)
        elif level == 'W': self.log.warning (msg, where = where)
        elif level == 'E': self.log.error   (msg, where = where)
        else: self.log.error('Could not parse planner log line: ' + line)


    def get_config(self, mdi, with_limits):
        state = self.ctrl.state
        config = self.ctrl.config
        is_pwm = config.get('tool-type') == 'PWM Spindle'
        deviation = config.get('max-deviation')

        cfg = {
            # NOTE Must get current units not configured default units
            'default-units': 'METRIC' if state.get('metric') else 'IMPERIAL',
            'max-vel':   state.get_axis_vector('vm', 1000),
            'max-accel': state.get_axis_vector('am', 1000000),
            'max-jerk':  state.get_axis_vector('jm', 1000000),
            'rapid-auto-off':  config.get('rapid-auto-off') and is_pwm,
            'max-blend-error': deviation,
            'max-merge-error': deviation,
            'max-arc-error':   deviation / 10,
            'junction-accel':  config.get('junction-accel'),
        }

        # We place an upper limit of 1000 km/min^3 on jerk for MDI movements
        if mdi:
            for axis in 'xyzabc':
                if axis in cfg['max-jerk']:
                    cfg['max-jerk'][axis] = min(1000 * 1000000, cfg['max-jerk'][axis])

        if with_limits:
            minLimit = state.get_soft_limit_vector('tn', -math.inf)
            maxLimit = state.get_soft_limit_vector('tm', math.inf)

            # If max <= min then no limit
            for axis in 'xyzabc':
                if maxLimit[axis] <= minLimit[axis]:
                    minLimit[axis], maxLimit[axis] = -math.inf, math.inf

            cfg['min-soft-limit'] = minLimit
            cfg['max-soft-limit'] = maxLimit

        if not mdi:
            program_start = config.get('program-start')
            if program_start: cfg['program-start'] = program_start

        overrides = {}

        tool_change = config.get('tool-change')
        if tool_change: overrides['M6'] = tool_change

        program_end = config.get('program-end')
        if program_end: overrides['M2'] = program_end

        if overrides: cfg['overrides'] = overrides

        self.log.info('Config:' + self.log_json(cfg))

        return cfg
