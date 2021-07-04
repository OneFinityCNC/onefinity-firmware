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

import time
from bbctrl.PlannerBase import PlannerBase
from bbctrl.CommandQueue import CommandQueue
import bbctrl.Cmd as Cmd


class Planner(PlannerBase):
    def __init__(self, ctrl):
        super().__init__(ctrl, 'Planner')
        
        self.cmdq = CommandQueue(ctrl)
        self._position_dirty = False
        self.where = ''

        ctrl.state.add_listener(self._update)

        self.reset(False)
        self._report_time()


    def is_busy(self):
        return self.is_running() or self.cmdq.is_active()


    def is_running(self):
        return self.planner.is_running()


    def position_change(self):
        self._position_dirty = True


    def _sync_position(self, force = False):
        if not force and not self._position_dirty: return
        self._position_dirty = False
        self.planner.set_position(self.ctrl.state.get_position())


    def _update(self, update):
        if 'id' in update:
            id = update['id']
            self.planner.set_active(id) # Release planner commands
            self.cmdq.release(id)       # Synchronize planner variables


    def _add_message(self, text):
        self.ctrl.state.add_message(text)

        line = self.ctrl.state.get('line', 0)
        if 0 <= line: where = '%s:%d' % (self.where, line)
        else: where = self.where

        self.log.message(text, where = where)


    def _enqueue_set_cmd(self, id, name, value):
        self.log.info('set(#%d, %s, %s)', id, name, value)
        self.cmdq.enqueue(id, self.ctrl.state.set, name, value)


    def _report_time(self):
        state = self.ctrl.state.get('xx', '')

        if state in ('STOPPING', 'RUNNING') and self.move_start:
            delta = time.time() - self.move_start
            if self.move_time < delta: delta = self.move_time
            plan_time = self.current_plan_time + delta

            self.ctrl.state.set('plan_time', round(plan_time))

        elif state != 'HOLDING': self.ctrl.state.set('plan_time', 0)

        self.ctrl.ioloop.call_later(1, self._report_time)


    def _plan_time_restart(self):
        self.plan_time = self.ctrl.state.get('plan_time', 0)


    def _update_time(self, plan_time, move_time):
        self.current_plan_time = plan_time
        self.move_time = move_time
        self.move_start = time.time()


    def _enqueue_line_time(self, block):
        if block.get('first', False) or block.get('seeking', False): return

        # Sum move times
        move_time = sum(block['times']) / 1000 # To seconds

        self.cmdq.enqueue(block['id'], self._update_time, self.plan_time,
                          move_time)

        self.plan_time += move_time


    def _enqueue_dwell_time(self, block):
        self.cmdq.enqueue(block['id'], self._update_time, self.plan_time,
                          block['seconds'])
        self.plan_time += block['seconds']


    def __encode(self, block):
        type, id = block['type'], block['id']

        if type != 'set': self.log.info('Cmd:' + self.log_json(block))

        if type == 'line':
            self._enqueue_line_time(block)
            return Cmd.line(block['target'], block['exit-vel'],
                            block['max-accel'], block['max-jerk'],
                            block['times'], block.get('speeds', []))

        if type == 'set':
            name, value = block['name'], block['value']

            if name == 'message':
                self.cmdq.enqueue(id, self._add_message, value)

            if name in ['line', 'tool']: self._enqueue_set_cmd(id, name, value)

            if name == 'speed':
                self._enqueue_set_cmd(id, name, value)
                return Cmd.speed(value)

            if len(name) and name[0] == '_':
                # Don't queue axis positions, can be triggered by new position
                if len(name) != 2 or name[1] not in 'xyzabc':
                    self._enqueue_set_cmd(id, name[1:], value)

            if name == '_feed': # Must come after _enqueue_set_cmd() above
                return Cmd.set_sync('if', 1 / value if value else 0)

            if name[0:1] == '_' and name[1:2] in 'xyzabc':
                if name[2:] == '_home': return Cmd.set_axis(name[1], value)

                if name[2:] == '_homed':
                    motor = self.ctrl.state.find_motor(name[1])
                    if motor is not None:
                        return Cmd.set_sync('%dh' % motor, value)

            return

        if type == 'input':
            # TODO handle timeout
            self.planner.synchronize(0) # TODO Fix this
            return Cmd.input(block['port'], block['mode'], block['timeout'])

        if type == 'output':
            return Cmd.output(block['port'], int(float(block['value'])))

        if type == 'dwell':
            self._enqueue_dwell_time(block)
            return Cmd.dwell(block['seconds'])

        if type == 'pause': return Cmd.pause(block['pause-type'])

        if type == 'seek':
            sw = self.ctrl.state.get_switch_id(block['switch'])
            return Cmd.seek(sw, block['active'], block['error'])

        if type == 'end': return '' # Sends id

        raise Exception('Unknown planner command "%s"' % type)


    def _encode(self, block):
        cmd = self.__encode(block)

        if cmd is not None:
            self.cmdq.enqueue(block['id'], None)
            return Cmd.set_sync('id', block['id']) + '\n' + cmd


    def _reset_times(self):
        self.move_start = 0
        self.move_time = 0
        self.plan_time = 0
        self.current_plan_time = 0


    def close(self):
        # Release planner callbacks
        if self.planner is not None:
            self.planner.set_resolver(None)
            self.planner.set_logger(None)


    def reset(self, stop = True):
        if stop: self.ctrl.mach.stop()

        self._init_planner()
        self._position_dirty = True
        self.cmdq.clear()
        self._reset_times()
        self.ctrl.state.reset()


    def mdi(self, cmd, with_limits = True):
        self.where = '<mdi>'
        self.log.info('MDI:' + cmd)
        self._sync_position()
        self.planner.load_string(cmd, self.get_config(True, with_limits))
        self._reset_times()


    def load(self, path):
        self.where = path
        path = self.ctrl.get_path('upload', path)
        self.log.info('GCode:' + path)
        self._sync_position()
        self.planner.load(path, self.get_config(False, True))
        self._reset_times()


    def stop(self):
        try:
            self.planner.stop()
            self.cmdq.clear()

        except:
            self.log.exception('Internal error: Planner stop')
            self.reset()


    def restart(self):
        try:
            id = self.ctrl.state.get('id')
            position = self.ctrl.state.get_position()

            self.log.info('Planner restart: %d %s' % (id, self.log_json(position)))

            self.cmdq.clear()
            self.cmdq.release(id)
            self._plan_time_restart()
            self.planner.restart(id, position)

        except:
            self.log.exception('Internal error: Planner restart')
            self.stop()


    def next(self):
        try:
            while self.planner.has_more():
                cmd = self.planner.next()
                cmd = self._encode(cmd)
                if cmd is not None: return cmd

        except RuntimeError as e:
            # Pass on the planner message
            self.log.error('Runtime error: Planner next: %s' % str(e))
            self.stop()

        except:
            self.log.exception('Internal error: Planner next')
            self.stop()
