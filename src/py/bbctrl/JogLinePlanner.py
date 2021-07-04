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

from bbctrl.PlannerBase import PlannerBase 
import bbctrl.Cmd as Cmd


class JogLinePlanner(PlannerBase):
    def __init__(self, ctrl, gcode):
        super().__init__(ctrl, 'JogLinePlanner')
        super()._init_planner()

        self.planner.set_position(self.ctrl.state.get_position())
        self.planner.load_string(gcode, self.get_config(True, False))


    def next(self):
        try:
            while self.planner.has_more():
                cmd = self.planner.next()

                self.planner.set_active(cmd['id']) # Release plan

                if cmd['type'] == 'line':
                    return (Cmd.line(cmd['target'], cmd['exit-vel'],
                                    cmd['max-accel'], cmd['max-jerk'],
                                    cmd['times'], cmd.get('speeds', []))
                    ).replace('l', 'J', 1)  # make it an async "jog line"

        except RuntimeError as e:
            # Pass on the planner message
            self.log.error('Runtime error: StepPlanner next: %s' % str(e))
            self.stop()

        except:
            self.log.exception('Internal error: StepPlanner next')
            self.stop()
