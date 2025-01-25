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

import os
import json
import pkg_resources
from pkg_resources import Requirement, resource_filename


def get_resource(path):
    return resource_filename(Requirement.parse('bbctrl'), 'bbctrl/' + path)


class Config(object):
    def __init__(self, ctrl):
        self.ctrl = ctrl
        self.log = ctrl.log.get('Config')

        self.values = {}

        try:
            self.version = "1.6.1"

            # Load config template
            with open(get_resource('http/config-template.json'), 'r',
                      encoding = 'utf-8') as f:
                self.template = json.load(f)

        except Exception: self.log.exception('Internal error: Failed to load config template')

    def load(self):
        path = self.ctrl.get_path('config.json')

        try:
            if os.path.exists(path):
                with open(path, 'r') as f: config = json.load(f)
            else: config = {'version': self.version}

            try:
                self._upgrade(config)
            except Exception: self.log.exception('Internal error: Failed to upgrade config')

        except Exception as e:
            self.log.warning('%s', e)
            config = {'version': self.version}

        self._defaults(config)
        return config


    def reload(self):
        self._update(self.load(), True)


    def get(self, name, default = None):
        return self.values.get(name, default)
    
    def set(self, name, default = None):
        path = self.ctrl.get_path('config.json')

        try:
            if os.path.exists(path):
                with open(path, 'r') as f: config_data = json.load(f)
            else: config_data = {'version': self.version}

            if name in config_data:
                existing_value = config_data[name]
                if isinstance(existing_value, dict) and isinstance(default, dict):
                    config_data[name] = {**existing_value, **default}
                    # existing_value.update(default)
                elif isinstance(existing_value, list) and isinstance(default, list):
                    config_data[name].extend(default)
                elif isinstance(existing_value, list):
                    config_data[name].append(default)
                else:
                    config_data[name] = default
            else:
                config_data[name] = default
            
            self.save(config_data)
        except Exception: self.log.exception('Internal error: Failed to upgrade config')

    def save(self, config):
        self._upgrade(config)
        self._update(config, False)


        with open(self.ctrl.get_path('config.json'), 'w') as f:
            json.dump(config, f, indent=2)

        os.sync()

        self.ctrl.preplanner.invalidate_all()
        self.log.info('Saved')


    def reset(self):
        if os.path.exists('config.json'): os.unlink('config.json')
        self.reload()
        self.ctrl.preplanner.invalidate_all()


    def _valid_value(self, template, value):
        type = template['type']

        try:
            if type == 'int':   value = int(value)
            if type == 'float': value = float(value)
            if type == 'text':  value = str(value)
            if type == 'bool':  value = bool(value)
        except:
            return False

        if 'values' in template and value not in template['values']:
            return False

        return True


    def __defaults(self, config, name, template):
        if 'type' in template:
            if (not name in config or
                not self._valid_value(template, config[name])):
                config[name] = template['default']

            elif 'max' in template and template['max'] < config[name]:
                config[name] = template['max']

            elif 'min' in template and config[name] < template['min']:
                config[name] = template['min']

            if template['type'] == 'list':
                if 'index' in template:
                    config = config[name]

                    for i in range(len(template['index'])):
                        if len(config) <= i: config.append({})

                        for name, tmpl in template['template'].items():
                            self.__defaults(config[i], name, tmpl)

        else:
            for name, tmpl in template.items():
                self.__defaults(config, name, tmpl)


    def _defaults(self, config):
        for name, tmpl in self.template.items():
            if not 'type' in tmpl:
                if not name in config: config[name] = {}
                conf = config[name]
            else: conf = config

            self.__defaults(conf, name, tmpl)


    def _upgrade(self, config):
        version = config['version']
        version = version.split('b')[0] # Strip off any "beta" suffix
        version = version.split('-')[0]
        version = tuple(map(int, version.split('.'))) # Break it into a tuple of integers

        if version < (1, 0, 7):
            config['settings']['max-deviation'] = 0.001
            config['settings']['junction-accel'] = 200000
            config['settings']['probing-prompts'] = True
            config['probe']['probe-fast-seek'] = 75
            config['probe']['probe-slow-seek'] = 25
            for motor in config['motors']:
                motor['stall-microstep'] = 8
                motor['stall-current'] = 1
                motor['idle-current'] = 1
                motor['max-accel'] = 750
                motor['latch-backoff'] = 5
                if motor['axis'] == 'X' or motor['axis'] == 'Y':
                    motor['search-velocity'] = 1.688
                    motor['max-velocity'] = 10
                    motor['max-jerk'] = 1000
                    motor['zero-backoff'] = 1.5
                if motor['axis'] == 'Z':
                    motor['search-velocity'] = 0.675
                    motor['max-velocity'] = 3
                    motor['max-jerk'] = 1000
                    motor['zero-backoff'] = 1

        if version < (1, 0, 8):
            config['settings']['max-deviation'] = 0.05
            config['settings']['junction-accel'] = 200000

        if version < (1, 0, 9):
            with open(get_resource('http/onefinity_defaults.json'), 'r', encoding = 'utf-8') as f:
                defaults = json.load(f)
                config['selected-tool-settings'] = defaults['selected-tool-settings'];

        config['version'] = self.version.split('b')[0]
        config['full_version'] = self.version


    def _encode(self, name, index, config, tmpl, with_defaults):
        # Handle category
        if not 'type' in tmpl:
            for name, entry in tmpl.items():
                if 'type' in entry and config is not None:
                    conf = config.get(name, None)
                else: conf = config
                self._encode(name, index, conf, entry, with_defaults)
            return

        # Handle defaults
        if config is not None: value = config
        elif with_defaults: value = tmpl['default']
        else: return

        # Handle list
        if tmpl['type'] == 'list':
            if 'index' in tmpl:
                for i in range(len(tmpl['index'])):
                    if config is not None and i < len(config): conf = config[i]
                    else: conf = None
                    self._encode(name, index + tmpl['index'][i], conf,
                                tmpl['template'], with_defaults)
            else:
                self.values[name]=value
                self.ctrl.state.config(name,value)
            return

        # Update config values
        if index:
            if not name in self.values: self.values[name] = {}
            self.values[name][index] = value

        else: self.values[name] = value

        # Update state variable
        if not 'code' in tmpl: return

        if tmpl['type'] == 'enum':
            if value in tmpl['values']: value = tmpl['values'].index(value)
            else: value = tmpl['default']

        elif tmpl['type'] == 'bool': value = 1 if value else 0
        elif tmpl['type'] == 'percent': value /= 100.0

        self.ctrl.state.config(index + tmpl['code'], value)


    def _update(self, config, with_defaults):
        for name, tmpl in self.template.items():
            conf = config.get(name, None)
            self._encode(name, '', conf, tmpl, with_defaults)
