from bbctrl.Ctrl import Ctrl
from bbctrl.Log import Logger
from evdev.ecodes import EV, EV_ABS, EV_KEY
from pyudev._util import udev_list_iterate
import errno
import evdev
import functools
import json
import os
import pyudev
import re
import sys
import traceback
import typing

AbsMinMax = typing.NamedTuple('AbsMinMax', [('min', float), ('max', float)])

userGamepadConfigs = {}

factoryGamepadConfigs = {
    "default": {
        "sign-x": 1,
        "sign-y": -1,
        "sign-z": -1,
        "debug": False,
        "type": "XBOX",
    },
    "XBOX": {
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
        "EV_ABS:2": "lock-y",
        "EV_ABS:5": "lock-x",
    },
    "PLAYSTATION": {
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
        "EV_KEY:310": "lock-y",
        "EV_KEY:311": "lock-x",
    },
    "SMX-LEFT": {
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
        "EV_KEY:310": "lock-y",
        "EV_KEY:311": "lock-x",
    },
    "SMX-BOTTOM": {
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
        "EV_KEY:312": "lock-y",
        "EV_KEY:313": "lock-x",
    },
    "LOGITECH-F310-D": {
        "EV_KEY:291": "speed-4",
        "EV_KEY:290": "speed-3",
        "EV_KEY:289": "speed-2",
        "EV_KEY:288": "speed-1",
        "EV_ABS:0": "axis-x",
        "EV_ABS:16": "axis-x",
        "EV_ABS:1": "axis-y",
        "EV_ABS:17": "axis-y",
        "EV_ABS:5": "axis-z",
        "EV_KEY:292": "lock-y",
        "EV_KEY:293": "lock-x",
        "EV_KEY:294": "lock-y",
        "EV_KEY:295": "lock-x",
    },
    "045E:02A1": {
        "description": "XBox 360 Controller",
        "type": "XBOX"
    },
    "045E:028E": {
        "description": "Xbox360 Controller",
        "type": "XBOX",
    },
    "045E:028F": {
        "description": "Xbox360 Wireless Controller",
        "type": "XBOX",
    },
    "045E:0B12": {
        "description": "XBox One Controller",
        "type": "XBOX"
    },
    "046D:C216": {
        "description": "Logitech F310, D mode",
        "type": "LOGITECH-F310-D"
    },
    "046D:C219": {
        "description": "Logitech F710, D mode",
        "type": "PLAYSTATION"
    },
    "046D:C21D": {
        "description": "Logitech F310, X mode",
        "type": "XBOX"
    },
    "046D:C21F": {
        "description": "Logitech 710, X mode",
        "type": "XBOX"
    },
    "054C:05C4": {
        "description": "Sony Playstation 4 DualShock Controller",
        "type": "PLAYSTATION"
    },
    "054C:09CC": {
        "description": "Sony Playstation 4 DualShock Controller",
        "type": "PLAYSTATION"
    },
    "054C:0BA0": {
        "description": "Sony Playstation 4 DualShock Controller",
        "type": "PLAYSTATION"
    },
    "054C:0CE6": {
        "description": "Sony Playstation 5 DualSense Controller",
        "type": "PLAYSTATION"
    },
    "11C0:5500": {
        "description": "EasySMX ESM-9013, bottom lights mode",
        "type": "SMX-BOTTOM"
    },
    "11C1:9101": {
        "description": "EasySMX ESM-9013, left lights mode",
        "type": "SMX-LEFT"
    },
    "20BC:5500": {
        "description": "EasySMX ESM-9100, bottom lights mode",
        "type": "SMX-BOTTOM"
    },
    "20BC:9100": {
        "description": "EasySMX ESM-9100, left lights mode",
        "type": "SMX-LEFT"
    },
}


def safe_int(s, base=10, val=None):
    try:
        return int(s, base)
    except ValueError:
        return val


def decode(value):
    if not isinstance(value, str):
        value = value.decode(sys.getfilesystemencoding(), errors="replace")
    return value


def get_udev_properties(device: pyudev.Device):
    properties = device._libudev.udev_device_get_properties_list_entry(device)

    return {
        decode(key): decode(value)
        for (key, value) in udev_list_iterate(device._libudev, properties)
    }


def sorted_json(value):
    return json.dumps(value, sort_keys=True)


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


# A forward declaration, so Command can reference it
class Gamepad(object):
    pass


class Command(object):

    def __init__(self, id: str, event: evdev.InputEvent, value: int,
                 gamepad: Gamepad):
        self.id = id
        self.event = event
        self.value = value
        self.gamepad = gamepad

    def __str__(self):
        return "Command({}={}, Event(type={}, code={}, value={}))".format(
            self.id, self.value, EV[self.event.type], self.event.code,
            self.event.value)


class Gamepad(object):
    _logOnceRecord = set()
    _eventValuesByCode = {}

    def __init__(self, ctrl: Ctrl, log: Logger, _evdev: evdev.InputDevice,
                 _udev: pyudev.Device):
        self._ctrl = ctrl
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
            "udev": get_udev_properties(_udev)
        }

        self.id = "{:04X}:{:04X}".format(_evdev.info.vendor,
                                         _evdev.info.product)
        self._loadConfig()

        self.log("Configuration Settings: {}".format(self.config))

    def read(self):
        return self._evdev.read()

    @property
    def fd(self):
        return self._evdev.fd

    @property
    def devicePath(self):
        return self._evdev.path

    def getCommandFromEvent(self, event: evdev.InputEvent) -> Command:
        if event.type not in [EV_ABS, EV_KEY]:
            return

        value = self.scaleAndClampValue(event)

        lastValue = self._eventValuesByCode.get(event.code)
        if value == lastValue:
            return

        self._eventValuesByCode[event.code] = value

        eventSignature = "{}:{}".format(EV[event.type], event.code)
        commandId = self.config.get(eventSignature)

        if not commandId:
            self.logOnce("Unmapped event: {}".format(eventSignature))
            return

        command = Command(commandId, event, value, self)

        self.logDebug(command)

        return command

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

        deadband = self._ctrl.config.get("gamepad-deadband", 0.15)
        deadband = self.config.get("deadband", deadband)
        if value < deadband:
            return 0

        # Remap the value to use the full range, with the "deadband" range removed
        # e.g. if value == deadband, the new value will be zero
        delta = value - deadband
        range = 1 - deadband
        value = (delta * sign) / range

        return round(value, 3)

    def log(self, msg):
        self._log.info("{}: {}".format(self.id, msg))

    def logOnce(self, msg):
        if self.config.get("debug") or msg not in self._logOnceRecord:
            self._logOnceRecord.add(msg)
            self.log(msg)

    def logDebug(self, msg):
        if self.config.get("debug"):
            self.log(msg)

    def _loadConfig(self):
        config = {
            **factoryGamepadConfigs.get("default"),
            **userGamepadConfigs.get("default", {}),
            **factoryGamepadConfigs.get(self.id, {}),
            **userGamepadConfigs.get(self.id, {})
        }

        while "type" in config:
            type = config.pop("type")
            config = {
                **factoryGamepadConfigs.get(type, {}),
                **userGamepadConfigs.get(type, {}),
                **config,
            }

        self.config = config

    def __str__(self) -> str:
        return sorted_json({
            "devicePath": self.devicePath,
            "bustype": self._evdev.info.bustype,
            "details": self._details,
            "id": self.id
        })


class GamepadSupport(object):
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
        try:
            path = self.ctrl.get_path('gamepads.json')
            if os.path.exists(path):
                with open(path, 'r') as f:
                    global userGamepadConfigs
                    userGamepadConfigs = json.load(f)
        except:
            self.log.info("Failed to read 'gamepads.json':")
            self.log.info(traceback.format_exc())
            userGamepadConfigs = {}

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
                    sorted_json(
                        {key: udev.properties[key]
                         for key in udev.properties})))
                continue

            if udev.action == 'add':
                self._listen(udev.device_node)
            elif udev.action == 'remove':
                self._forget(udev.device_node)

    def _discoverGamepads(self):
        with open("/proc/bus/input/devices",
                  "r",
                  encoding="ascii",
                  errors="replace") as file:
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
        self._refreshDefaultGamepadType()

        gamepad = Gamepad(
            self.ctrl, self.log, evdev.InputDevice(devicePath),
            pyudev.Devices.from_device_file(self.udev_context, devicePath))

        self.log.info("Found gamepad: {}".format(gamepad))

        self.gamepads[gamepad.fd] = self.gamepads[devicePath] = gamepad

        self.ioloop.add_handler(gamepad.fd, self._gamepadHandler,
                                self.ioloop.READ)

    def _forget(self, devicePath: str):
        gamepad = self.gamepads.get(devicePath)
        if not gamepad:
            return

        gamepad.log("Gamepad removed: {}".format(devicePath))

        self.ioloop.remove_handler(gamepad.fd)
        del self.gamepads[gamepad.devicePath]
        del self.gamepads[gamepad.fd]

    def _gamepadHandler(self, fd, events):
        gamepad = self.gamepads.get(fd)
        if not gamepad:
            self.log.info("Unknown gamepad? {}".format(fd))
            return

        try:
            for event in gamepad.read():
                command = gamepad.getCommandFromEvent(event)
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

    def _processCommand(self, command: Command):
        if not command:
            return

        processor = self.commandProcessors.get(command.id)
        if not processor:
            command.gamepad.log("Bad command: {}".format(command))
            return

        processor(self, command)

    def _processSpeedCommand(self, command: Command):
        match = re.match(r"^speed-(\d)$", command.id)
        speed = int(match.group(1)) if match else 0
        if speed not in [1, 2, 3, 4]:
            command.gamepad.log("Bad speed command: {}".format(command))

        self.changed = self.changed or self.speed != speed
        self.speed = speed

    def _processAxisCommand(self, command: Command):
        match = re.match(r"^axis-(.)$", command.id)
        axis = match.group(1) if match else ""
        if axis not in ["x", "y", "z"]:
            command.gamepad.log("Bad axis command: {}".format(command))

        sign = command.gamepad.config.get("sign-{}".format(axis), 1)
        oldValue = self.axes[axis]
        locked = self.lock.get(axis, False)

        self.axes[axis] = 0 if locked else command.value * sign
        self.changed = self.changed or oldValue != self.axes[axis]

        command.gamepad.logDebug(
            "{}(value={}, oldValue={}, sign={}, locked={})".format(
                command.id, self.axes[axis], oldValue, sign, locked))

    def _processLockCommand(self, command: Command):
        match = re.match(r"^lock-(.)$", command.id)
        axis = match.group(1) if match else ""
        if axis not in ["x", "y"]:
            command.gamepad.log("Bad lock command: {}".format(command))

        if command.event.type == EV_ABS:
            self.lock[axis] = bool(command.value > -0.9)
        else:
            self.lock[axis] = bool(command.value)

    def _processDisabled(self, command: Command):
        pass

    def _refreshDefaultGamepadType(self):
        defaultGamepadType = self.ctrl.config.get("gamepad-default-type")

        if defaultGamepadType is not None:
            default = factoryGamepadConfigs.get("default", {})
            default["type"] = defaultGamepadType
            factoryGamepadConfigs["default"] = default

            default = userGamepadConfigs.get("default")
            if default is not None:
                default.pop("type", None)

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
