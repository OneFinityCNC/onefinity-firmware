from bbctrl.Ctrl import Ctrl
from bbctrl.Log import Logger
from evdev.ecodes import EV_ABS, EV_KEY
import errno
import evdev
import functools
import hashlib
import json
import os
import pyudev
import re
import traceback
import typing

userGamepadConfigs = {}

gamepadConfigs = {
    "default": {
        "sign-x": 1,
        "sign-y": -1,
        "sign-z": -1,
        "deadband": 0.15
    },
    "9E2B3A63": {
        "description": "Logitech 710, X mode",
        "EV_KEY:308": "speed-4",
        "EV_KEY:305": "speed-3",
        "EV_KEY:304": "speed-2",
        "EV_KEY:307": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:4": "axis-z",
        "EV_KEY:310": "lock-y",
        "EV_KEY:311": "lock-x",
    },
    "B98EF4EC": {
        "description": "Logitech 710, D mode",
        "EV_KEY:307": "speed-4",
        "EV_KEY:306": "speed-3",
        "EV_KEY:305": "speed-2",
        "EV_KEY:304": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:5": "axis-z",
        "EV_KEY:308": "lock-y",
        "EV_KEY:309": "lock-x",
    },
    "268256FD": {
        "description": "EasySMX ESM-9013, top lights mode",
        "EV_KEY:308": "speed-4",
        "EV_KEY:305": "speed-3",
        "EV_KEY:304": "speed-2",
        "EV_KEY:307": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:4": "axis-z",
        "EV_KEY:310": "lock-y",
        "EV_KEY:311": "lock-x",
    },
    "23CEC0CB": {
        "description": "EasySMX ESM-9013, left lights mode",
        "EV_KEY:304": "speed-4",
        "EV_KEY:305": "speed-3",
        "EV_KEY:306": "speed-2",
        "EV_KEY:307": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:5": "axis-z",
        "EV_KEY:308": "lock-y",
        "EV_KEY:309": "lock-x",
    },
    "370DCB72": {
        "description": "EasySMX ESM-9013, bottom lights mode",
        "EV_KEY:308": "speed-4",
        "EV_KEY:305": "speed-3",
        "EV_KEY:304": "speed-2",
        "EV_KEY:307": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:5": "axis-z",
        "EV_KEY:310": "lock-y",
        "EV_KEY:311": "lock-x",
    },
    "0BD0841F": {
        "description": "Sony Playstation 4 Dual-Shock Controller",
        "EV_KEY:307": "speed-4",
        "EV_KEY:306": "speed-3",
        "EV_KEY:305": "speed-2",
        "EV_KEY:304": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:5": "axis-z",
        "EV_KEY:308": "lock-y",
        "EV_KEY:309": "lock-x",
    }
}


def safe_int(s, base=10, val=None):
    try:
        return int(s, base)
    except ValueError:
        return val


def get_udev_prop(device: pyudev.Device, propertyName: str):
    try:
        return device.properties[propertyName]
    except:
        return None


def to_sorted_json(value):
    return json.dumps(value, sort_keys=True)


AbsMinMax = typing.NamedTuple('AbsMinMax', [('min', float), ('max', float)])


def processCapabilities(capabilities):
    result = {}

    for (type, details) in capabilities.items():
        if type == EV_KEY:
            result[type] = details

        if type == EV_ABS:
            result[type] = {
                code: AbsMinMax(float(info.min), float(info.max))
                for (code, info) in details
            }

    return result


class Gamepad(object):
    _logRecord = set()

    def __init__(self, log: Logger, _evdev: evdev.InputDevice,
                 _udev: pyudev.Device):
        self._log = log
        self._evdev = _evdev
        self._udev = _udev

        self._capabilities = processCapabilities(_evdev.capabilities())

        self._details = {
            "evdev": {
                "name": _evdev.name,
                "vendor": _evdev.info.vendor,
                "product": _evdev.info.product,
                "version": _evdev.info.version,
                "capabilities": self._capabilities,
            },
            "udev": {key: _udev.properties[key]
                     for key in _udev.properties}
        }

        json = to_sorted_json(self._details["evdev"])
        self.hash = hashlib.sha256(json.encode()).hexdigest()[-8:].upper()

        self.config = {
            **gamepadConfigs.get("default"),
            **userGamepadConfigs.get("default", {}),
            **gamepadConfigs.get(self.hash, {}),
            **userGamepadConfigs.get(self.hash, {})
        }

    def read(self):
        return self._evdev.read()

    @property
    def fd(self):
        return self._evdev.fd

    @property
    def devicePath(self):
        return self._evdev.path

    def scaleAndClampValue(self, event: evdev.InputEvent):
        if event.type != EV_ABS:
            return event.value

        info = self._capabilities[EV_ABS].get(event.code)  # type: AbsMinMax
        if not info:
            return 0

        # Clamp the value to the device's min/max range
        value = float(max(info.min, min(info.max, event.value)))

        # Remap the value from the device range to -1..1
        value = ((value - info.min) / (info.max - info.min)) * 2.0 - 1.0

        sign = -1 if value < 0 else 1
        value = abs(value)

        deadband = self.config.get("deadband", 0.15)
        if value < deadband:
            return 0

        # Remap the value to use the full range, with the "deadband" range removed
        # e.g. if value == deadband, the new value will be zero
        delta = value - deadband
        range = 1 - deadband
        return (delta * sign) / range

    def log(self, msg):
        self._log.info("{}: {}".format(self.hash, msg))

    def logOnce(self, msg):
        if self.config.get("debug") or msg not in self._logRecord:
            self._logRecord.add(msg)
            self.log(msg)

    def logDebug(self, msg):
        if self.config.get("debug"):
            self.log(msg)

    def __str__(self) -> str:
        return to_sorted_json({
            "devicePath": self.devicePath,
            "bustype": self._evdev.info.bustype,
            "details": self._details,
            "hash": self.hash
        })


class Command(object):

    def __init__(self, id: str, value: int, gamepad: Gamepad):
        self.id = id
        self.value = value
        self.gamepad = gamepad

    def __str__(self):
        return "Command(id='{}', value={}, gamepad='{}')".format(
            self.id, self.value, self.gamepad.hash)


class Jog(object):
    gamepads = {}  # type: dict[typing.Union[int, str], Gamepad]
    lock = {"x": False, "y": False}
    axes = {"x": 0, "y": 0, "z": 0}
    speed = 3  # a resonable default speed, not too fast, not too slow
    changed = False

    def __init__(self, ctrl: Ctrl):
        self.ctrl = ctrl
        self.ioloop = ctrl.ioloop
        self.log = ctrl.log.get('Jog')

        self._loadUserGamepadConfigs()
        self._startMonitoring()
        self._discoverGamepads()
        self._updateJogging()

    def _loadUserGamepadConfigs(self):
        path = self.ctrl.get_path('gamepads.json')
        if os.path.exists(path):
            with open(path, 'r') as f:
                global userGamepadConfigs
                userGamepadConfigs = json.load(f)

    def _startMonitoring(self):
        self.udev_context = pyudev.Context()
        self.monitor = pyudev.Monitor.from_netlink(self.udev_context)
        self.monitor.filter_by(subsystem='input')
        self.ctrl.ioloop.add_handler(self.monitor, self._udevHandler,
                                     self.ctrl.ioloop.READ)
        self.monitor.start()

    def _udevHandler(self, fd, events):
        for udev in iter(functools.partial(self.monitor.poll, 0), None):
            isEventDevice = re.search(r"/event\d+$", udev.device_node or "")
            if not isEventDevice:
                continue

            inputJoystick = safe_int(udev.properties["ID_INPUT_JOYSTICK"])

            if inputJoystick != 1:
                self.log.info("Ignoring non-gamepad device: {}".format(
                    to_sorted_json(
                        {key: udev.properties[key]
                         for key in udev.properties})))
                continue

            if udev.action == 'add':
                self._listen(udev.device_node)
            elif udev.action == 'remove':
                self._forget(udev.device_node)

    def _discoverGamepads(self):
        with open("/proc/bus/input/devices", "r") as file:
            for line in file:
                # Matches lines from '/proc/bus/input/devices' that look like:
                # H: Handlers=js1 event0
                if not re.match(r"H:\s*Handlers\s*=.*\bjs\d+\b", line):
                    continue

                match = re.search(r"\bevent\d+\b", line)
                if not match:
                    continue

                self._listen("/dev/input/{}".format(match.group()))

    def _listen(self, devicePath: str):
        gamepad = Gamepad(
            self.log, evdev.InputDevice(devicePath),
            pyudev.Devices.from_device_file(self.udev_context, devicePath))

        self.log.info("Found gamepad: {}".format(str(gamepad)))

        self.gamepads[gamepad.fd] = self.gamepads[devicePath] = gamepad

        self.ioloop.add_handler(gamepad.fd, self._gamepadHandler,
                                self.ioloop.READ)

    def _forget(self, devicePath: str):
        gamepad = self.gamepads.get(devicePath)
        if not gamepad:
            return

        self.log.info("Device removed: {}, {}".format(gamepad.hash,
                                                      devicePath))

        self.ioloop.remove_handler(gamepad.fd)
        del self.gamepads[gamepad.devicePath]
        del self.gamepads[gamepad.fd]

    def _gamepadHandler(self, fd, events):
        gamepad = self.gamepads.get(fd)
        if not gamepad:
            self.log.info("_gamepad_handler: Unknown gamepad? {}".format(fd))
            return

        try:
            for event in gamepad.read():
                command = self._getCommandFromEvent(gamepad, event)
                if command:
                    self._processCommand(command)
        except BlockingIOError:
            pass
        except OSError as error:
            if error.errno == errno.ENODEV:
                self._forget(gamepad.devicePath)
            else:
                gamepad.log(traceback.format_exc())
        except Exception as error:
            gamepad.log(traceback.format_exc())

    def _getCommandFromEvent(self, gamepad: Gamepad,
                             event: evdev.InputEvent) -> Command:
        if event.type not in [EV_ABS, EV_KEY]:
            return

        eventSignature = "{}:{}".format(evdev.ecodes.EV[event.type],
                                        event.code)
        commandId = gamepad.config.get(eventSignature)

        if not commandId:
            gamepad.logOnce("Unmapped event: {}:{}".format(
                gamepad.hash, eventSignature))
            return

        gamepad.logDebug("Got event: {}".format(str(event)))

        return Command(commandId, gamepad.scaleAndClampValue(event), gamepad)

    def _processCommand(self, command: Command):
        processor = self.commandProcessors.get(command.id)
        if not processor:
            command.gamepad.log("Unrecognized command: {}".format(command.id))
            return

        command.gamepad.logDebug("Processing command: {}".format(str(command)))

        processor(self, command)

    def _processSpeedCommand(self, command: Command):
        match = re.match(r"^speed-(\d)$", command.id)
        speed = int(match.group(1)) if match else 0
        if speed not in [1, 2, 3, 4]:
            command.gamepad.log("Unrecognized speed command: {}".format(
                str(command)))

        self.changed = self.changed or self.speed != speed
        self.speed = speed

    def _processAxisCommand(self, command: Command):
        match = re.match(r"^axis-(.)$", command.id)
        axis = match.group(1) if match else ""
        if axis not in ["x", "y", "z"]:
            command.gamepad.log("Unrecognized axis command: {}".format(
                str(command)))

        sign = command.gamepad.config.get("sign-{}".format(axis), 1)
        oldValue = self.axes[axis]
        locked = self.lock.get(axis, False)

        self.axes[axis] = 0 if locked else command.value * sign
        self.changed = self.changed or oldValue != self.axes[axis]

        command.gamepad.logDebug("_processAxisCommand: {}".format(
            json.dumps({
                "command.value": command.value,
                "axis": axis,
                "oldValue": oldValue,
                "value": self.axes[axis],
                "sign": sign,
                "locked": locked,
                "changed": self.changed
            })))

    def _processLockCommand(self, command: Command):
        match = re.match(r"^lock-(.)$", command.id)
        axis = match.group(1) if match else ""
        if axis not in ["x", "y"]:
            command.gamepad.log("Unrecognized lock command: {}".format(
                str(command)))

        self.lock[axis] = bool(command.value)

    def _processDisabled(self, command: Command):
        pass

    def _updateJogging(self):
        try:
            if not self.changed:
                return

            self.changed = False

            if self.speed == 1: scale = 1.0 / 128.0
            if self.speed == 2: scale = 1.0 / 32.0
            if self.speed == 3: scale = 1.0 / 4.0
            if self.speed == 4: scale = 1.0

            axes = {axis: value * scale for (axis, value) in self.axes.items()}
            try:
                self.ctrl.mach.jog(axes)
            except:
                self.log.info(traceback.format_exc())
        finally:
            # We only update 4 times a second, to keep from overwhelming the system
            # EV_ABS events can happen hundreds of times a second.
            self.ctrl.ioloop.call_later(0.25, self._updateJogging)

    commandProcessors = {
        "speed-1": _processSpeedCommand,
        "speed-2": _processSpeedCommand,
        "speed-3": _processSpeedCommand,
        "speed-4": _processSpeedCommand,
        "axis-x": _processAxisCommand,
        "axis-y": _processAxisCommand,
        "axis-z": _processAxisCommand,
        "lock-x": _processLockCommand,
        "lock-y": _processLockCommand,
        "disabled": _processDisabled
    }  # type: dict[str, typing.Callable[[Command], None]]
