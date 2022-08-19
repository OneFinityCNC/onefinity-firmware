import logging

from inevent.Constants import *


log = logging.getLogger('inevent')
log.setLevel(logging.INFO)


def axes_to_string(axes):
    s = ''
    for axis in axes:
        if s: s += ', '
        else: s = '('
        s += '{:6.3f}'.format(axis)
    return s + ')'


def event_to_string(event, state):
    s = '{} {}: '.format(event.get_source(), event.get_type_name())

    if event.type == EV_ABS:
        s += axes_to_string(state.get_joystick3d()) + ' ' + \
            axes_to_string(state.get_joystickR3d()) + ' ' + \
            '({:2.0f}, {:2.0f}) '.format(*state.get_hat())

    if event.type == EV_REL:
        s += '({:d}, {:d}) '.format(*state.get_mouse()) + \
            '({:d}, {:d})'.format(*state.get_wheel())

    if event.type == EV_KEY:
        state = 'pressed' if event.value else 'released'
        s += '0x{:x} {}'.format(event.code, state)

    return s


class JogHandler:
    def __init__(self, config):
        self.config = config
        self.reset()


    def changed(self):
        log.info(axes_to_string(self.axes) + ' x {:d}'.format(self.speed))


    def reset(self):
        self.axes = [0.0, 0.0, 0.0, 0.0]
        self.speed = 3
        self.vertical_lock = 0
        self.horizontal_lock = 0


    def clear(self):
        self.reset()
        self.changed()


    def get_config(self, name):
        if name in self.config: return self.config[name]
        return self.config['default']


    def event(self, event, state, dev_name):
        if event.type not in [EV_ABS, EV_REL, EV_KEY]: return

        config = self.get_config(dev_name)
        changed = False

        # Process event
        if event.type == EV_ABS and event.code in config['axes']:
            old_axes = list(self.axes)
            deadband = config['deadband']
            axis = config['axes'].index(event.code)

            self.axes[axis] = event.stream.state.abs[event.code]
            self.axes[axis] *= config['dir'][axis]

            value = abs(self.axes[axis])
            if value >= deadband:
                sign = -1 if self.axes[axis] < 0 else 1
                delta = value - deadband
                range = 1 - deadband

                # Scale the new value to the available range (full range, minus the deadband)
                self.axes[axis] = (delta * sign) / range
            else:
                self.axes[axis] = 0
                
            if self.horizontal_lock and axis not in [0, 3]:
                self.axes[axis] = 0

            if self.vertical_lock and axis not in [1, 2]:
                self.axes[axis] = 0

            if old_axes[axis] != self.axes[axis]: changed = True

        elif event.type == EV_KEY and event.code in config['speed']:
            old_speed = self.speed
            self.speed = config['speed'].index(event.code) + 1
            if self.speed != old_speed: changed = True

        elif event.type == EV_KEY and event.code in config['lock']:
            index = config['lock'].index(event.code)

            self.horizontal_lock, self.vertical_lock = False, False

            if event.value:
                if index == 0: self.horizontal_lock = True
                if index == 1: self.vertical_lock = True

        log.debug(event_to_string(event, state))

        if changed: self.changed()
