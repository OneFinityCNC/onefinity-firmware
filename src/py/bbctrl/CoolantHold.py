#!/usr/bin/env python3

################################################################################
#                                                                              #
#   Mist coolant safety for paused jobs (Onefinity fork, build p11).           #
#                                                                              #
#   M7 switches the Load 1 output on and nothing but M9 or the end of the      #
#   program switches it off.  A pause (M0, M1, or the Pause button) therefore  #
#   leaves the mister running while the machine stands still, which floods the #
#   table if the operator walks away.                                          #
#                                                                              #
#   This class turns the mist output off when a job is paused and, when the    #
#   operator resumes, turns it back on and waits a moment so mist is already   #
#   flowing before the cutter moves again.  It has no dependencies on the rest #
#   of the controller so that it can be tested on its own.                     #
#                                                                              #
################################################################################


class CoolantHold:
    def __init__(self, set_mist, call_later, log, delay = 2.0):
        self.set_mist = set_mist      # set_mist(True/False): immediate output
        self.call_later = call_later  # call_later(seconds, fn, *args)
        self.log = log
        self.delay = delay

        self.held = False      # We switched mist off because of a pause
        self.pending = False   # Resume requested, waiting for mist to flow
        self.token = 0         # Invalidates a pending resume when cancelled


    def on_update(self, paused, mist_on):
        '''Call on every controller state update.
        paused:  the machine is held by a pause the operator can resume from
        mist_on: the mist output is currently on'''
        if paused:
            if mist_on and not self.held:
                self.held = True
                self.log.info('Pause: mist off')
                try: self.set_mist(False)
                except BaseException as e:
                    self.log.error('Mist off failed: %s' % e)

        # Left the hold some other way (stop, e-stop, ...).  Leave mist off.
        elif self.held and not self.pending:
            self.held = False


    def resume(self, proceed):
        '''The operator asked to resume.  Restore mist if we turned it off,
        then call proceed() once it has had time to start flowing.  proceed()
        is always called, whatever happens to the mist.'''
        if self.pending: return # Ignore repeated clicks while waiting

        if not self.held:
            proceed()
            return

        try:
            self.set_mist(True)
            self.pending = True
            self.token += 1
            self.log.info('Resume: mist on, waiting %.1fs' % self.delay)
            self.call_later(self.delay, self._finish, proceed, self.token)

        except BaseException as e:
            self.log.error('Mist restore failed: %s' % e)
            self.pending = False
            self.held = False
            proceed()


    def _finish(self, proceed, token):
        if token != self.token or not self.pending: return # Cancelled
        self.pending = False
        self.held = False
        proceed()


    def cancel(self):
        '''Stop, e-stop, or a new cycle: forget everything and do nothing.'''
        self.held = False
        self.pending = False
        self.token += 1
