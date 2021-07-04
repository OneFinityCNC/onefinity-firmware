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

from collections import deque
import bbctrl
from bbctrl.Comm import Comm
import bbctrl.Cmd as Cmd
from bbctrl.JogLinePlanner import JogLinePlanner


# Axis homing procedure:
#
#   Mark axis unhomed
#   Set feed rate to search_vel
#   Seek closed by search_dist
#   Set feed rate to latch_vel
#   Seek open latch_backoff
#   Seek closed latch_backoff * -1.5
#   Rapid to zero_backoff
#   Mark axis homed and set absolute position

axis_homing_procedure = '''
  G28.2 %(axis)s0 F[#<_%(axis)s_search_velocity>]
  G38.6 %(axis)s[#<_%(axis)s_home_travel>]
  G38.8 %(axis)s[#<_%(axis)s_latch_backoff>] F[#<_%(axis)s_latch_velocity>]
  G38.6 %(axis)s[#<_%(axis)s_latch_backoff> * -8]
  G91 G0 G53 %(axis)s[#<_%(axis)s_zero_backoff>]
  G90 G28.3 %(axis)s[#<_%(axis)s_home_position>]
'''

# The stepper drivers have a stall flag that is reset
# by moving the motors without a stall condition.
# The "wiggle" in the stall procedure is to clear the flag.
# This was to correct the issue where the stepper motors
# may already be in a stall condition when homing is started.
# For example, if a user tried to home twice in a row
# the second homing attempt would immediately think it
# was stalled if we didn't first back it up a bit
stall_homing_procedure = '''
  G91 G1 %(axis)s [#<_%(axis)s_zero_backoff>] F[#<_%(axis)s_search_velocity>]
  G4 P0.25
  G28.2 %(axis)s0 F[#<_%(axis)s_search_velocity>]
  G38.6 %(axis)s[#<_%(axis)s_home_travel>]
  G91 G1 G53 %(axis)s[#<_%(axis)s_zero_backoff>] F100
  G90 G28.3 %(axis)s[#<_%(axis)s_home_position>]
'''

motor_fault_error = '''\
Motor %d driver fault.  A potentially damaging electrical condition was \
detected and the motor driver was shutdown.  Please power down the controller \
and check your motor cabling. See the "Motor Faults" table on the "Indicators" \
for more information.\
'''

def overrides(interface_class):
    def overrider(method):
        if not method.__name__ in dir(interface_class):
            raise Exception('%s does not override %s' % (
                method.__name__, interface_class.__name__))

        return method

    return overrider


class Mach(Comm):
    def __init__(self, ctrl, avr):
        super().__init__(ctrl, avr)

        self.ctrl = ctrl
        self.mlog = self.ctrl.log.get('Mach')

        self.planner = bbctrl.Planner(ctrl)
        self.unpausing = False
        self.stopping = False

        self.position_at_pause = None
        self.after_pause_callbacks = deque()
        self.after_jog_callbacks = deque()

        ctrl.state.set('cycle', 'idle')

        ctrl.state.add_listener(self._update)

        super().reboot()


    def _get_state(self): return self.ctrl.state.get('xx', '')
    def _is_estopped(self): return self._get_state() == 'ESTOPPED'
    def _is_holding(self): return self._get_state() == 'HOLDING'
    def _is_jogging(self): return self._get_state() == 'JOGGING'
    def _is_ready(self): return self._get_state() == 'READY'
    def _get_pause_reason(self): return self.ctrl.state.get('pr', '')
    def _get_cycle(self): return self.ctrl.state.get('cycle', 'idle')


    def _is_paused(self):
        if not self._is_holding() or self.unpausing: return False
        return self._get_pause_reason() in (
            'User pause', 'Program pause', 'Optional pause')


    def _set_cycle(self, cycle):
        self.ctrl.state.set('cycle', cycle)


    def _begin_cycle(self, cycle):
        current = self._get_cycle()

        if current == cycle:
            return

        allow = (
            current == 'idle' or
            (cycle == 'jogging' and self._is_paused())
        )

        if allow:
            self._set_cycle(cycle)
        else:
            raise Exception('Cannot enter %s cycle while in %s cycle' % (cycle, current))


    def _after_pause(self, cb):
        self.after_pause_callbacks.append(cb)


    def _after_jog(self, cb):
        self.after_jog_callbacks.append(cb)


    def _update(self, update):
        # Detect motor faults
        for motor in range(4):
            key = '%ddf' % motor
            if key in update and update[key] & 0x1f:
                self.mlog.error(motor_fault_error % motor)

        # Get state
        state_changed = 'xc' in update
        state = self._get_state()

        # Handle EStop
        if state_changed and state == 'ESTOPPED': self.planner.reset(False)

        # Exit cycle if state changed to READY
        if (state_changed and self._get_cycle() != 'idle' and
            self._is_ready() and not self.planner.is_busy() and
            not super().is_active()):
            self.planner.position_change()
            self._set_cycle('idle')

        # Return to idle state if we're done jogging during a pause
        if (state_changed and self._get_cycle() == 'jogging' and self._is_holding()):
            self.planner.position_change()
            self._set_cycle('idle')

            # Call any "after jog" callbacks
            while len(self.after_jog_callbacks) > 0:
                cb = self.after_jog_callbacks.popleft()
                cb()

        # Planner stop
        if state == 'READY' and self.stopping:
            self.planner.stop()
            self.ctrl.state.set('line', 0)
            self.stopping = False

        # Unpause sync
        if state_changed and state != 'HOLDING':
            self.unpausing = False

        # Entering HOLDING state
        if state_changed and state == 'HOLDING':
            # Always flush queue after pause
            super().i2c_command(Cmd.FLUSH)
            super().resume()
    
            # Call any "after pause" callbacks
            while len(self.after_pause_callbacks) > 0:
                cb = self.after_pause_callbacks.popleft()
                cb()

        # Automatically unpause after seek or stop hold
        # Must be after holding commands above
        op = self.ctrl.state.get('optional_pause', False)
        pr = self._get_pause_reason()
        if ((state_changed or 'pr' in update) and self._is_holding() and
            (pr in ('Switch found', 'User stop') or
             (pr == 'Optional pause' and not op))):
            self._unpause()


    def _unpause(self):
        pause_reason = self._get_pause_reason()
        self.mlog.info('Unpause: ' + pause_reason)

        if pause_reason == 'User stop':
            self.planner.stop()
            self.ctrl.state.set('line', 0)
        else:
            self.planner.restart()

        super().i2c_command(Cmd.UNPAUSE)
        self.unpausing = True


    def _reset(self): self.planner.reset()


    def _i2c_block(self, block):
        super().i2c_command(block[0], block = block[1:])


    def _i2c_set(self, name, value):
        self._i2c_block(Cmd.set(name, value))


    @overrides(Comm)
    def comm_next(self):
        if (self.planner.is_running() and
            not (self._is_holding() or self._is_jogging())):
            return self.planner.next()


    @overrides(Comm)
    def comm_error(self):
        self._reset()


    @overrides(Comm)
    def connect(self):
        self._reset()
        super().connect()


    def _query_var(self, cmd):
        equal = cmd.find('=')
        if equal == -1:
            self.mlog.info('%s=%s' % (cmd, self.ctrl.state.get(cmd[1:])))

        else:
            name, value = cmd[1:equal], cmd[equal + 1:]

            if value.lower() == 'true': value = True
            elif value.lower() == 'false': value = False
            else:
                try:
                    value = float(value)
                except: pass

            self.ctrl.state.config(name, value)


    def mdi(self, cmd, with_limits = True):
        if not len(cmd): return
        if   cmd[0] == '$':  self._query_var(cmd)
        elif cmd[0] == '\\': super().queue_command(cmd[1:])
        else:
            self._begin_cycle('mdi')
            self.planner.mdi(cmd, with_limits)
            super().resume()


    def set(self, code, value):
        super().queue_command('${}={}'.format(code, value))


    def jog(self, params):
        self._begin_cycle('jogging')
        self.planner.position_change()

        if 'mode' in params and params['mode'] == 'line':
            jogLinePlanner = JogLinePlanner(self.ctrl, params['gcode'])
            done = False
            while not done:
                cmd = jogLinePlanner.next()
                if cmd is None:
                    done = True
                else:
                    super().queue_command(cmd)
        else:
            super().queue_command(Cmd.jog(params))


    def home(self, axis, position = None):
        state = self.ctrl.state

        if axis is None: axes = 'zxyabc' # TODO This should be configurable
        else: axes = '%c' % axis

        for axis in axes:
            enabled = state.is_axis_enabled(axis)
            mode = state.axis_homing_mode(axis)

            # If this is not a request to home a specific axis and the
            # axis is disabled or in manual homing mode, don't show any
            # warnings
            if 1 < len(axes) and (not enabled or mode == 'manual'):
                continue

            # Error when axes cannot be homed
            reason = state.axis_home_fail_reason(axis)
            if reason is not None:
                self.mlog.error('Cannot home %s axis: %s' % (
                    axis.upper(), reason))
                continue

            if mode == 'manual':
                if position is None: raise Exception('Position not set')
                self.mdi('G28.3 %c%f' % (axis, position))
                continue

            # Home axis
            self.mlog.info('Homing %s axis' % axis)
            self._begin_cycle('homing')

            if mode.startswith('stall-'): procedure = stall_homing_procedure
            else: procedure = axis_homing_procedure

            gcode = procedure % {'axis': axis}

            self.planner.mdi(gcode, False)
            super().resume()


    def unhome(self, axis): self.mdi('G28.2 %c0' % axis)
    def estop(self): super().estop()


    def clear(self):
        if self._is_estopped():
            self._reset()
            super().clear()


    def start(self):
        filename = self.ctrl.state.get('selected', '')
        if not filename: return
        self._begin_cycle('running')
        self.planner.load(filename)
        super().resume()


    def step(self):
        raise Exception('NYI') # TODO
        if self._get_cycle() != 'running': self.start()
        else: super().i2c_command(Cmd.UNPAUSE)


    def stop(self):
        if self._get_state() != 'jogging': self.stopping = True
        super().i2c_command(Cmd.STOP)

    
    def pause(self):
        super().pause()

        if not self.ctrl.config.get('lift-on-pause'):
            return

        def lift_on_pause():
            self.position_at_pause = self.ctrl.state.get_position()
            self.jog({
                'mode': 'line',
                'gcode': 'G90\nG0 Z0'
            })

        self._after_pause(lift_on_pause)


    def unpause(self):
        if not self._is_paused():
            return

        self.ctrl.state.set('optional_pause', False)
        if self.position_at_pause is None:
            self._unpause()
        else:
            position = self.position_at_pause
            self.position_at_pause = None

            def jog_z():
                self.jog({
                    'mode': 'line',
                    'gcode': 'G90\nG0 Z0'
                })

            def jog_x_y():
                self.jog({
                    'mode': 'line',
                    'gcode': 'G90\nG0 X%s Y%s' % (position['x'], position['y'])
                })

                self._after_jog(self._unpause)

            jog_z()
            self._after_jog(jog_x_y)


    def optional_pause(self, enable = True):
        self.ctrl.state.set('optional_pause', enable)


    def set_position(self, axis, position):
        axis = axis.lower()
        state = self.ctrl.state

        if state.is_axis_homed(axis):
            # If homed, change the offset rather than the absolute position
            self.mdi('G92%s%f' % (axis, position))

        elif state.is_axis_enabled(axis):
            if self._get_cycle() != 'idle' and not self._is_paused():
                raise Exception('Cannot set position during ' +
                                self._get_cycle())

            # Set the absolute position both locally and via the AVR
            target = position + state.get('offset_' + axis)
            state.set(axis + 'p', target)
            super().queue_command(Cmd.set_axis(axis, target))


    def override_feed(self, override):
        self._i2c_set('fo', int(1000 * override))


    def override_speed(self, override):
        self._i2c_set('so', int(1000 * override))


    def modbus_read(self, addr): self._i2c_block(Cmd.modbus_read(addr))


    def modbus_write(self, addr, value):
        self._i2c_block(Cmd.modbus_write(addr, value))
