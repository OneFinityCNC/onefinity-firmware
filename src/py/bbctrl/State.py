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

import traceback
import copy
import uuid
import os
import bbctrl
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import glob
class UploadChangeHandler(FileSystemEventHandler):
    def __init__(self, state):
        self.state = state

    def on_any_event(self, event): 
        self.state.load_files()


class State(object):
    def __init__(self, ctrl):
        self.ctrl = ctrl
        self.log = ctrl.log.get('State')

        self.callbacks = {}
        self.changes = {}
        self.listeners = []
        self.timeout = None
        self.machine_var_set = set()
        self.message_id = 0

        # Defaults
        self.vars = {
            'line': -1,
            'messages': [],
            'tool': 0,
            'feed': 0,
            'speed': 0,
            'sid': str(uuid.uuid4()),
            'demo': ctrl.args.demo,
        }

        # Add computed variable callbacks for each motor.
        #
        # NOTE, variable callbacks must return metric values only because
        # the planner will scale returned values when in imperial mode.
        for i in range(4):
            self.set_callback(str(i) + 'home_position',
                              lambda name, i = i: self.motor_home_position(i))
            self.set_callback(str(i) + 'home_travel',
                              lambda name, i = i: self.motor_home_travel(i))
            self.set_callback(str(i) + 'latch_backoff',
                              lambda name, i = i: self.motor_latch_backoff(i))
            self.set_callback(str(i) + 'zero_backoff',
                              lambda name, i = i: self.motor_zero_backoff(i))
            self.set_callback(str(i) + 'search_velocity',
                              lambda name, i = i: self.motor_search_velocity(i))
            self.set_callback(str(i) + 'latch_velocity',
                              lambda name, i = i: self.motor_latch_velocity(i))

        #self.set_callback('metric', lambda name: 1 if self.is_metric() else 0)
        #self.set_callback('imperial', lambda name: 0 if self.is_metric() else 1)

        self.reset()
        self.load_files()

        observer = Observer()
        observer.schedule(UploadChangeHandler(self), self.ctrl.get_upload(), recursive=True)
        observer.start()


    def init(self):
        # Init machine units
        metric = self.ctrl.config.get('units', 'METRIC').upper() == 'METRIC'
        self.log.info('INIT Metric %d' % metric)
        if not 'metric' in self.vars: self.set('metric', metric)
        if not 'imperial' in self.vars: self.set('imperial', not metric)
        
        # Bit diameter for probing
        diameter = self.ctrl.config.get('probe-diameter', 6.35)
        self.log.info('INIT Diameter %f' % diameter)
        self.set('bitDiameter',diameter)


    def reset(self):
        # Unhome all motors
        for i in range(4): self.set('%dhomed' % i, False)

        # Zero offsets and positions
        for axis in 'xyzabc':
            self.set(axis + 'p', 0)
            self.set('offset_' + axis, 0)


    def load_files(self):
        files = []

        upload = self.ctrl.get_upload()

        if not os.path.exists(upload):
            os.mkdir(upload)

        files = filter(os.path.isfile, glob.glob(upload + '/*'))
        # Sort list of files based on last modification time in ascending order
        files = sorted(files, key=os.path.getmtime, reverse=True)
        files = list(map(lambda f: f.replace("./upload/", ""), files))

        self.set('files', files)

        if len(files): self.select_file(files[0])
        else: self.select_file('') 
    
    def return_files(self):
        files = copy.deepcopy(self.get('files'))
        return files
    

    def clear_files(self):
        self.select_file('')
        self.set('files', [])


    def add_file(self, filename):
        if filename.startswith('EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE'):
            filename=filename.replace('EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE','')
            files = copy.deepcopy(self.get('files'))
            if not filename in files:
                files.append(filename)
                files.sort()
                self.set('files', files)
        else:
            files = copy.deepcopy(self.get('files'))
            if not filename in files:
                files.append(filename)
                files.sort()
                self.set('files', files)
            self.select_file(filename)

    def remove_file(self, filename):
        files = copy.deepcopy(self.get('files'))
        if filename in files:
            files.remove(filename)
            self.set('files', files)

        if self.get('selected', filename) == filename:
            if len(files): self.select_file('')
            else: self.select_file('')


    def select_file(self, filename):
        self.set('selected', filename)
        time = os.path.getmtime(self.ctrl.get_upload(filename))
        self.set('selected_time', time)


    def set_bounds(self, bounds):
        for axis in 'xyzabc':
            for name in ('min', 'max'):
                var = '%s_%s' % (axis, name)
                value = bounds[name][axis] if axis in bounds[name] else 0
                self.set(var, value)


    def ack_message(self, id):
        self.log.info('Message %d acknowledged' % id)
        msgs = self.vars['messages']
        msgs = list(filter(lambda m: id < m['id'], msgs))
        self.set('messages', msgs)


    def add_message(self, text):
        msg = dict(text = text, id = self.message_id)
        self.message_id += 1
        msgs = self.vars['messages']
        msgs = msgs + [msg] # It's important we make a new list here
        self.set('messages', msgs)


    def _notify(self):
        if not self.changes: return

        for listener in self.listeners:
            try:
                listener(self.changes)

            except Exception as e:
                self.log.warning('Updating state listener: %s',
                            traceback.format_exc())

        self.changes = {}
        self.timeout = None


    def resolve(self, name):
        # Resolve axis prefixes to motor numbers
        if 2 < len(name) and name[1] == '_' and name[0] in 'xyzabc':
            motor = self.find_motor(name[0])
            if motor is not None: return str(motor) + name[2:]

        return name


    def has(self, name): return self.resolve(name) in self.vars
    def set_callback(self, name, cb): self.callbacks[self.resolve(name)] = cb


    def set(self, name, value):
        name = self.resolve(name)
        load_position = False

        if name == 'cycle' and self.vars.get('cycle') == 'homing' and value == 'idle':
            load_position = True

        if not name in self.vars or self.vars[name] != value:
            self.vars[name] = value
            self.changes[name] = value

            # Trigger listener notify
            if self.timeout is None:
                self.timeout = self.ctrl.ioloop.call_later(0.25, self._notify)

        # Loading origin from config after homing 
        if load_position and self.vars.get('cycle') == 'idle':
            axes = 'xyzbc' if self.vars.get('2an') == 3 else 'xyzabc'
            for axis in axes:
                offset = self.ctrl.config.get('offset_' + axis)
                if offset is not None and self.get('offset_'+ axis) == 0:
                    origin = offset if self.get('metric') == True else offset / 25.4
                    self.log.info('axis: {} offset: {} origin: {}'.format(axis, offset, origin))
                    self.ctrl.mach.set_position(axis, -origin)
            

    def update(self, update):
        for name, value in update.items():
            self.set(name, value)


    def get(self, name, default = None):
        name = self.resolve(name)

        if name in self.vars: return self.vars[name]
        if name in self.callbacks: return self.callbacks[name](name)
        if default is None:
            self.log.warning('State variable "%s" not found' % name)

        return default


    def snapshot(self):
        vars = copy.deepcopy(self.vars)

        for name in self.callbacks:
            if not name in vars:
                vars[name] = self.callbacks[name](name)

        axis_motors = {axis: self.find_motor(axis) for axis in 'xyzabc'}
        axis_vars = {}

        for name, value in vars.items():
            if name[0] in '0123':
                motor = int(name[0])

                for axis in 'xyzabc':
                    if motor == axis_motors[axis]:
                        axis_vars[axis + '_' + name[1:]] = value

        vars.update(axis_vars)

        return vars


    def config(self, code, value):
        # Set machine variables via mach, others directly
        if code in self.machine_var_set: self.ctrl.mach.set(code, value)
        else: self.set(code, value)


    def add_listener(self, listener):
        self.listeners.append(listener)
        listener(self.vars)


    def remove_listener(self, listener): self.listeners.remove(listener)


    def set_machine_vars(self, vars):
        # Record all machine vars, indexed or otherwise
        self.machine_var_set = set()
        for code, spec in vars.items():
            if 'index' in spec:
                for index in spec['index']:
                    self.machine_var_set.add(index + code)
            else: self.machine_var_set.add(code)


    def get_position(self):
        position = {}

        for axis in 'xyzabc':
            if self.is_axis_enabled(axis) and self.has(axis + 'p'):
                position[axis] = self.get(axis + 'p')

        return position


    def get_axis_vector(self, name, scale = 1):
        v = {}

        for axis in 'xyzabc':
            motor = self.find_motor(axis)

            if motor is not None and self.motor_enabled(motor):
                value = self.get(str(motor) + name, None)
                if value is not None: v[axis] = value * scale

        return v


    def get_soft_limit_vector(self, var, default):
        limit = self.get_axis_vector(var, 1)

        for axis in 'xyzabc':
            if not axis in limit or not self.is_axis_homed(axis):
                limit[axis] = default

        return limit


    def find_motor(self, axis):
        for motor in range(4):
            if not ('%dan' % motor) in self.vars: continue
            motor_axis = 'xyzabc'[self.vars['%dan' % motor]]
            if motor_axis == axis.lower() and self.vars.get('%dme' % motor, 0):
                return motor


    def is_axis_homed(self, axis): return self.get('%s_homed' % axis, False)


    def is_axis_enabled(self, axis):
        motor = self.find_motor(axis)
        return motor is not None and self.motor_enabled(motor)


    def get_enabled_axes(self):
        axes = []

        for axis in 'xyzabc':
            if self.is_axis_enabled(axis):
                axes.append(axis)

        return axes


    def is_motor_faulted(self, motor):
        return self.get('%ddf' % motor, 0) & 0x1f


    def is_axis_faulted(self, axis):
        motor = self.find_motor(axis)
        return motor is not None and self.is_motor_faulted(motor)


    def axis_homing_mode(self, axis):
        motor = self.find_motor(axis)
        if motor is None: return 'disabled'
        return self.motor_homing_mode(motor)


    def axis_home_fail_reason(self, axis):
        motor = self.find_motor(axis)
        if motor is None: return 'Not mapped to motor'
        if not self.motor_enabled(motor): return 'Motor disabled'

        mode = self.motor_homing_mode(motor)

        if mode != 'manual':
            if mode == 'switch-min' and not int(self.get(axis + '_ls', 0)):
                return 'Configured for min switch but switch is disabled'

            if mode == 'switch-max' and not int(self.get(axis + '_xs', 0)):
                return 'Configured for max switch but switch is disabled'

        softMin = int(self.get(axis + '_tn', 0))
        softMax = int(self.get(axis + '_tm', 0))
        if softMax <= softMin + 1:
            return 'max-soft-limit must be at least 1mm greater ' \
                'than min-soft-limit'


    def motor_enabled(self, motor):
        return bool(int(self.vars.get('%dme' % motor, 0)))


    def motor_homing_mode(self, motor):
        mode = str(self.vars.get('%dho' % motor, 0))
        if mode == '0': return 'manual'
        if mode == '1': return 'switch-min'
        if mode == '2': return 'switch-max'
        if mode == '3': return 'stall-min'
        if mode == '4': return 'stall-max'
        raise Exception('Unrecognized homing mode "%s"' % mode)


    def motor_home_direction(self, motor):
        mode = self.motor_homing_mode(motor)
        if mode.endswith('-min'): return -1
        if mode.endswith('-max'): return 1
        return 0 # Disabled


    def motor_home_position(self, motor):
        mode = self.motor_homing_mode(motor)
        # Return soft limit positions
        if mode.endswith('-min'): return self.vars['%dtn' % motor]
        if mode.endswith('-max'): return self.vars['%dtm' % motor]
        return 0 # Disabled


    def motor_home_travel(self, motor):
        tmin = self.get(str(motor) + 'tm', 0)
        tmax = self.get(str(motor) + 'tn', 0)
        hdir = self.motor_home_direction(motor)

        # (travel_max - travel_min) * 1.5 * home_dir
        return (tmin - tmax) * 1.5 * hdir


    def motor_latch_backoff(self, motor):
        lb = self.get(str(motor) + 'lb', 0)
        hdir = self.motor_home_direction(motor)
        return -(lb * hdir) # -latch_backoff * home_dir


    def motor_zero_backoff(self, motor):
        zb = self.get(str(motor) + 'zb', 0)
        hdir = self.motor_home_direction(motor)
        return -(zb * hdir) # -zero_backoff * home_dir


    def motor_search_velocity(self, motor):
        return 1000 * self.get(str(motor) + 'sv', 0)


    def motor_latch_velocity(self, motor):
        return 1000 * self.get(str(motor) + 'lv', 0)


    def get_axis_switch(self, axis, side):
        axis = axis.lower()

        if not axis in 'xyzabc':
            raise Exception('Unsupported switch "%s-%s"' % (axis, side))

        if not self.is_axis_enabled(axis):
            raise Exception('Switch "%s-%s" axis not enabled' % (axis, side))

        motor = self.find_motor(axis)

        # This must match the switch ID enum in avr/src/switch.h
        hmode = self.motor_homing_mode(motor)
        if hmode.startswith('stall-'): return motor + 10
        return 2 * motor + 2 + (0 if side.lower() == 'min' else 1)


    def get_switch_id(self, switch):
        # TODO Support other input switches in CAMotics gcode/machine/PortType.h
        switch = switch.lower()
        if switch == 'probe': return 1
        if switch[1:] == '-min': return self.get_axis_switch(switch[0], 'min')
        if switch[1:] == '-max': return self.get_axis_switch(switch[0], 'max')
        raise Exception('Unsupported switch "%s"' % switch)
