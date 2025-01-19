import os
import json
import tornado
import sockjs.tornado
import datetime
import subprocess
import socket
from tornado.web import HTTPError
from tornado import gen
from tornado.escape import url_unescape
import re
import bbctrl
from urllib.request import urlopen
import iw_parse
import io
import zipfile
import shutil

def call_get_output(cmd):
    p = subprocess.Popen(cmd, stdout = subprocess.PIPE)
    s = p.communicate()[0].decode('utf-8')
    if p.returncode: raise HTTPError(400, 'Command failed')
    return s


def get_username():
    return call_get_output(['getent', 'passwd', '1001']).split(':')[0]


def set_username(username):
    if subprocess.call(['usermod', '-l', username, get_username()]):
        raise HTTPError(400, 'Failed to set username to "%s"' % username)


def check_password(password):
    # Get current password
    s = call_get_output(['getent', 'shadow', get_username()])
    current = s.split(':')[1].split('$')

    # Check password type
    if len(current) < 2 or current[1] != '1':
        raise HTTPError(401, "Password invalid")

    # Check current password
    cmd = ['openssl', 'passwd', '-salt', current[2], '-1', password]
    s = call_get_output(cmd).strip()

    if s.split('$') != current: raise HTTPError(401, 'Wrong password')



class RebootHandler(bbctrl.APIHandler):
    def put_ok(self):
        self.get_ctrl().lcd.goodbye('Rebooting...')
        subprocess.Popen(['reboot'])
        
class ShutdownHandler(bbctrl.APIHandler):
    def put_ok(self):
        subprocess.Popen(['shutdown','-h','now'])


class LogHandler(bbctrl.RequestHandler):
    def get(self):
        with open(self.get_ctrl().log.get_path(), 'r') as f:
            self.write(f.read())


    def set_default_headers(self):
        fmt = socket.gethostname() + '-%Y%m%d.log'
        filename = datetime.date.today().strftime(fmt)
        self.set_header('Content-Disposition', 'filename="%s"' % filename)
        self.set_header('Content-Type', 'text/plain')


class MessageAckHandler(bbctrl.APIHandler):
    def put_ok(self, id):
        self.get_ctrl().state.ack_message(int(id))


class BugReportHandler(bbctrl.RequestHandler):
    def get(self):
        import tarfile, io

        buf = io.BytesIO()
        tar = tarfile.open(mode = 'w:bz2', fileobj = buf)

        def check_add(path, arcname = None):
            if os.path.isfile(path):
                if arcname is None: arcname = path
                tar.add(path, self.basename + '/' + arcname)

        def check_add_basename(path):
            check_add(path, os.path.basename(path))

        ctrl = self.get_ctrl()
        path = ctrl.log.get_path()
        check_add_basename(path)
        for i in range(1, 8):
            check_add_basename('%s.%d' % (path, i))
        check_add_basename('/var/log/syslog')
        check_add('config.json')
        check_add(ctrl.get_upload(ctrl.state.get('selected', '')))

        tar.close()

        self.write(buf.getvalue())


    def set_default_headers(self):
        fmt = socket.gethostname() + '-%Y%m%d-%H%M%S'
        self.basename = datetime.datetime.now().strftime(fmt)
        filename = self.basename + '.tar.bz2'
        self.set_header('Content-Disposition', 'filename="%s"' % filename)
        self.set_header('Content-Type', 'application/x-bzip2')


class HostnameHandler(bbctrl.APIHandler):
    def get(self): self.write_json(socket.gethostname())

    def put(self):
        if self.get_ctrl().args.demo:
            raise HTTPError(400, 'Cannot set hostname in demo mode')

        if 'hostname' in self.json:
            if subprocess.call(['/usr/local/bin/sethostname',
                                self.json['hostname'].strip()]) == 0:
                self.write_json('ok')
                return

        raise HTTPError(400, 'Failed to set hostname')


class NetworkData(bbctrl.APIHandler):

    def get(self):
        try:
            ipAddresses = subprocess.check_output(
                "ip -4 addr | grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'", shell=True).decode().split()
            ipAddresses.remove("127.0.0.1")
            regex = re.compile(r'/255$/')
            filtered = [i for i in ipAddresses if not regex.match(i)]
            ipAddresses = filtered[0]
        except:
            ipAddresses = "Not Connected"
        try:
            wifi = subprocess.check_output(
                "sudo iw dev wlan0 info | grep ssid", shell=True).decode().split()
            wifi.pop(0)
            wifiName = " ".join(wifi)
        except:
            wifiName = "not connected"
        self.write_json({
            'ipAddresses': ipAddresses,
            'wifi': wifiName
        })

class NetworkHandler(bbctrl.APIHandler):

    def get(self):
        try:
            ipAddresses = subprocess.check_output(
                "ip -4 addr | grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'", shell=True).decode().split()
            ipAddresses.remove("127.0.0.1")
            regex = re.compile(r'/255$/')
            filtered = [i for i in ipAddresses if not regex.match(i)]
            ipAddresses = filtered[0]

        except:
            ipAddresses = "Not Connected"

        hostname = socket.gethostname()

        try:
            wifi = json.loads(call_get_output(['config-wifi', '-j']))
        except:
            wifi = {'enabled': False}

        try:
            lines = iw_parse.call_iwlist().decode("utf-8").split("\n")
            wifi['networks'] = iw_parse.get_parsed_cells(lines)
        except:
            wifi['networks'] = []

        self.write_json({
            'ipAddresses': ipAddresses,
            'hostname': hostname,
            'wifi': wifi
        })

    def put(self):
        if self.get_ctrl().args.demo:
            raise HTTPError(400, 'Cannot configure WiFi in demo mode')

        if not 'wifi' in self.json:
            raise HTTPError(400, 'Payload is missing wifi config information')

        wifi = self.json['wifi']
        cmd = ['config-wifi', '-r']

        if not wifi['enabled']:
            cmd += ['-d']
        else:
            if 'ssid' in wifi:
                cmd += ['-s', wifi['ssid']]

            if 'password' in wifi:
                cmd += ['-p', wifi['password']]

        if subprocess.call(cmd) == 0:
            self.write_json('ok')
            return

        raise HTTPError(400, 'Failed to configure wifi')


class UsernameHandler(bbctrl.APIHandler):
    def get(self): self.write_json(get_username())


    def put_ok(self):
        if self.get_ctrl().args.demo:
            raise HTTPError(400, 'Cannot set username in demo mode')

        if 'username' in self.json: set_username(self.json['username'])
        else: raise HTTPError(400, 'Missing "username"')


class PasswordHandler(bbctrl.APIHandler):
    def put(self):
        if self.get_ctrl().args.demo:
            raise HTTPError(400, 'Cannot set password in demo mode')

        if 'current' in self.json and 'password' in self.json:
            check_password(self.json['current'])

            # Set password
            s = '%s:%s' % (get_username(), self.json['password'])
            s = s.encode('utf-8')

            p = subprocess.Popen(['chpasswd', '-c', 'MD5'],
                                 stdin = subprocess.PIPE)
            p.communicate(input = s)

            if p.returncode == 0:
                self.write_json('ok')
                return

        raise HTTPError(401, 'Failed to set password')


class ConfigLoadHandler(bbctrl.APIHandler):
    def get(self):
        self.write_json(self.get_ctrl().config.load())


class ConfigDownloadHandler(bbctrl.APIHandler):
    def set_default_headers(self):
        fmt = socket.gethostname() + '-%Y%m%d.zip'
        filename = datetime.date.today().strftime(fmt)
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition',
                        'attachment; filename="%s"' % filename)

    def get(self,filename):
      buffer = io.BytesIO()
      zip_file = zipfile.ZipFile(buffer, mode="w")
      config_path = self.get_path('config.json')
      try:
          if os.path.exists(config_path):
              zip_file.write(config_path,'config.json')
          else: 
              json_bytes = json.dumps({'version': self.version}).encode("utf-8")
              zip_file.writestr("config.json",json_bytes)

      except Exception: self.log.exception('Internal error: Failed to download config')
      if not filename or filename == '/':
          zip_file.close()
          buffer.seek(0)
          self.write(buffer.getvalue())
          self.finish()

      filename = filename[1:]
      files = filename.split(',')

      for filename in files:
          filename = os.path.basename(url_unescape(filename))
          filepath = self.get_upload(filename)
          zip_file.write(filepath, filename)
        
      zip_file.close()
      buffer.seek(0)

      self.write(buffer.getvalue())
      self.finish()

class ConfigRestoreHandler(bbctrl.APIHandler):
    def put(self):
        if 'zipfile' not in self.request.files:
            raise HTTPError(400, 'No file uploaded')
        
        zip_file = self.request.files['zipfile'][0]
        temp_dir = './config-temp'

        if not os.path.exists(temp_dir):
            os.mkdir(temp_dir)

        files_path = os.path.join(temp_dir, zip_file['filename'])

        with open(files_path, 'wb') as f:
            f.write(zip_file['body'])

        if not os.path.exists(self.get_upload()):
            os.mkdir(self.get_upload())


        with zipfile.ZipFile(files_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir+'/extracted')

        extension = (".nc", ".ngc", ".gcode", ".gc")

        for root, dirs, files in os.walk(temp_dir+'/extracted'):
            for file in files:
                file_path = os.path.join(root, file)

                #Updating the config.json
                if file =="config.json":
                    with open(file_path, 'r') as json_file:
                        json_data = json.load(json_file)

                        if "macros" in json_data and isinstance(json_data['macros'], list):
                            json_data["macros_list"] = [
                                {"file_name": item["file_name"]}
                                for item in json_data["macros"]
                                if isinstance(item, dict) and "file_name" in item and item["file_name"] != "default"
                            ]
                        else:
                            json_data["macros_list"] = []

                        keys_to_remove = ['non_macros_list','gcode_list']
                        for key in keys_to_remove:
                            if key in json_data:
                                del json_data[key]
                        self.get_ctrl().config.save(json_data)

                #moving the gcodes from temp to uploads
                elif file.endswith(extension):
                    filename = self.get_upload(file).encode('utf8')
                    try:
                        os.link(file_path,filename)
                    except FileExistsError as e:
                        print('File already exists')
                    self.get_ctrl().preplanner.invalidate(file)
                    self.get_ctrl().state.add_file(file)

        shutil.rmtree(temp_dir)


class ConfigSaveHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().config.save(self.json)


class ConfigResetHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().config.reset()


class FirmwareUpdateHandler(bbctrl.APIHandler):
    def prepare(self): pass


    def put_ok(self):
        if not 'firmware' in self.request.files:
            raise HTTPError(401, 'Missing "firmware"')

        firmware = self.request.files['firmware'][0]

        if not os.path.exists('firmware'): os.mkdir('firmware')

        with open('firmware/update.tar.bz2', 'wb') as f:
            f.write(firmware['body'])

        self.get_ctrl().lcd.goodbye('Upgrading firmware')
        subprocess.Popen(['/usr/local/bin/update-bbctrl'])


class UpgradeHandler(bbctrl.APIHandler):
    def put_ok(self):
        self.get_ctrl().lcd.goodbye('Upgrading firmware')
        subprocess.Popen(['/usr/local/bin/upgrade-bbctrl'])


class PathHandler(bbctrl.APIHandler):
    @gen.coroutine
    def get(self, filename, dataType, *args):
        if not os.path.exists(self.get_upload(filename)):
            raise HTTPError(404, 'File not found')

        preplanner = self.get_ctrl().preplanner
        future = preplanner.get_plan(filename)

        try:
            delta = datetime.timedelta(seconds = 1)
            data = yield gen.with_timeout(delta, future)

        except gen.TimeoutError:
            progress = preplanner.get_plan_progress(filename)
            self.write_json(dict(progress = progress))
            return

        try:
            if data is None: return
            meta, positions, speeds = data

            if dataType == '/positions': data = positions
            elif dataType == '/speeds': data = speeds
            else:
                self.get_ctrl().state.set_bounds(meta['bounds'])
                self.write_json(meta)
                return

            filename = filename + '-' + dataType[1:]
            self.set_header('Content-Disposition', 'filename="%s"' % filename)
            self.set_header('Content-Type', 'application/octet-stream')
            self.set_header('Content-Encoding', 'gzip')
            self.set_header('Content-Length', str(len(data)))

            # Respond with chunks to avoid long delays
            SIZE = 102400
            chunks = [data[i:i + SIZE] for i in range(0, len(data), SIZE)]
            for chunk in chunks:
                self.write(chunk)
                yield self.flush()

        except tornado.iostream.StreamClosedError as e: pass


class HomeHandler(bbctrl.APIHandler):
    def put_ok(self, axis, action, *args):
        if axis is not None: axis = ord(axis[1:2].lower())

        if action == '/set':
            if not 'position' in self.json:
                raise HTTPError(400, 'Missing "position"')

            self.get_ctrl().mach.home(axis, self.json['position'])

        elif action == '/clear': self.get_ctrl().mach.unhome(axis)
        else: self.get_ctrl().mach.home(axis)


class StartHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.start()


class EStopHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.estop()


class ClearHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.clear()


class StopHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.stop()


class PauseHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.pause()


class UnpauseHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.unpause()


class OptionalPauseHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.optional_pause()


class StepHandler(bbctrl.APIHandler):
    def put_ok(self): self.get_ctrl().mach.step()


class PositionHandler(bbctrl.APIHandler):
    def put_ok(self, axis):
        self.get_ctrl().mach.set_position(axis, float(self.json['position']), True)


class OverrideFeedHandler(bbctrl.APIHandler):
    def put_ok(self, value): self.get_ctrl().mach.override_feed(float(value))


class OverrideSpeedHandler(bbctrl.APIHandler):
    def put_ok(self, value): self.get_ctrl().mach.override_speed(float(value))


class ModbusReadHandler(bbctrl.APIHandler):
    def put_ok(self):
        self.get_ctrl().mach.modbus_read(int(self.json['address']))


class ModbusWriteHandler(bbctrl.APIHandler):
    def put_ok(self):
        self.get_ctrl().mach.modbus_write(int(self.json['address']),
                                    int(self.json['value']))


class JogHandler(bbctrl.APIHandler):
    def put_ok(self):
        # Handle possible out of order jog command processing
        if 'ts' in self.json:
            ts = self.json['ts']
            id = self.get_cookie('client-id')

            if not hasattr(self.app, 'last_jog'):
                self.app.last_jog = {}

            last = self.app.last_jog.get(id, 0)
            self.app.last_jog[id] = ts

            if ts < last: return # Out of order

        self.get_ctrl().mach.jog(self.json)


displayRotatePattern = re.compile(r'display_rotate\s*=\s*(\d)')
transformationMatrixPattern = re.compile(
    r'(\n)(\s+)(MatchIsTouchscreen.*?\n)(\s+Option\s+\"TransformationMatrix\".*?\n)(.*?EndSection)',
    re.DOTALL)
matchIsTouchscreenPattern = re.compile(
    r'(\n)(\s+)(MatchIsTouchscreen.*?\n)(.*?EndSection)', re.DOTALL)
class ScreenRotationHandler(bbctrl.APIHandler):

    @gen.coroutine
    def get(self):
        with open("/boot/config.txt", 'rt') as config:
            lines = config.readlines()
            for line in lines:
                if line.startswith('display_rotate'):
                    self.write_json({
                        'rotated':
                        int(displayRotatePattern.search(line).group(1)) != 0
                    })
                    return

        self.write_json({'rotated': False})
        return

    @gen.coroutine
    def put_ok(self):
        rotated = self.json['rotated']

        subprocess.Popen([
            '/usr/local/bin/edit-boot-config',
            'display_rotate={}'.format(2 if rotated else 0)
        ])

        with open("/usr/share/X11/xorg.conf.d/40-libinput.conf",
                  'rt') as config:
            text = config.read()
            text = transformationMatrixPattern.sub(r'\1\2\3\5', text)
            if rotated:
                text = matchIsTouchscreenPattern.sub(
                    r'\1\2\3\2Option "TransformationMatrix" "-1 0 1 0 -1 1 0 0 1"\1\4',
                    text)
        with open("/usr/share/X11/xorg.conf.d/40-libinput.conf",
                  'wt') as config:
            config.write(text)

        subprocess.run('reboot')


class TimeHandler(bbctrl.APIHandler):

    def get(self):
        timeinfo = call_get_output(['timedatectl'])
        timezones = call_get_output(['timedatectl', 'list-timezones', '--no-pager'])
        self.write_json({'timeinfo': timeinfo, 'timezones': timezones})

    def put_ok(self):
        datetime = self.json.get('datetime', None)
        timezone = self.json.get('timezone', None)

        try:
            if datetime is not None:
                subprocess.Popen(['sudo','timedatectl', 'set-ntp', 'false'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                result1 = subprocess.Popen(['sudo','date', '-s', datetime], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                subprocess.Popen(['sudo','timedatectl', 'set-ntp', 'true'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                stdout, stderr = result1.communicate()

                if(result1.returncode == 0):
                    self.get_log('TimeHandler').info('Result1 {} : {}'.format(result1.returncode, stdout))
                else:
                    raise Exception(stderr)
            
            if timezone is not None:
                result2 = subprocess.Popen(['sudo','timedatectl', 'set-timezone', timezone], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                stdout, stderr = result2.communicate()

                if(result2.returncode == 0):
                    self.get_log('TimeHandler').info('Result2 {}'.format(result2.returncode))
                else:
                    raise Exception(stderr)

        except Exception as e:
            self.get_log('TimeHandler').info('Error: {}'.format(e))

class RotaryHandler(bbctrl.APIHandler):

    def put_ok(self):
        try:
            status = self.json.get('status', None)
            ctrl = self.get_ctrl()
            config = ctrl.config
            path = ctrl.get_path('config.json')

            if status is None:
                raise Exception("No status provided")
            
            try:
                if os.path.exists(path):
                    with open(path, 'r') as f: config_data = json.load(f)
                else: config_data = {'version': self.version}

            except Exception: self.log.exception('Internal error: Failed to load config template')


            motors = config_data.get("motors")
            
            if not motors:
                raise ValueError("Motors data not found in configuration")


            motor_1 = motors[1]
            motor_2 = motors[2]
            
            is_axis_A = motor_2.get("axis") == "A"

            if is_axis_A == status: return

            motor_2["axis"] = "Y" if is_axis_A else "A"
            motor_1["max-velocity"] *= 2 if is_axis_A else 0.5

            if is_axis_A:
                if 'min-soft-limit-backup' in motor_2 and 'max-soft-limit-backup' in motor_2:
                    motor_2['min-soft-limit'] = motor_2['min-soft-limit-backup']
                    motor_2['max-soft-limit'] = motor_2['max-soft-limit-backup']
                else:
                    raise ValueError("Backup soft limits are missing for motor_2.")
            else:
                motor_2['min-soft-limit-backup'] = motor_2['min-soft-limit']
                motor_2['max-soft-limit-backup'] = motor_2['max-soft-limit']

                motor_2['min-soft-limit'] = -720
                motor_2['max-soft-limit'] = 720

            config.save(config_data)

        except FileNotFoundError:
            self.get_log('RotaryHandler').error('Configuration file not found at {}'.format(path))
        except KeyError as e:
            self.get_log('RotaryHandler').error('Missing key in configuration data: {}'.format(e))
        except ValueError as e:
            self.get_log('RotaryHandler').error('Validation error: {}'.format(e))
        except Exception as e:
            self.get_log('RotaryHandler').error('Unexpected error: {}'.format(e))


class RemoteDiagnosticsHandler(bbctrl.APIHandler):

    def get(self):
        code = self.get_query_argument("code", "")
        command = self.get_query_argument("command", "")

        log = self.get_log('RemoteDiagnostics')

        if command == "disconnect":
            subprocess.Popen(['killall', 'ngrok'])
            self.write_json({'message': "Succesfully disconnected"})

        if command == "connect":
            try:
                url = 'https://tinyurl.com/1f-remote?code={}'.format(code)
                with urlopen(url) as response:
                    body = response.read()

                    os.makedirs("/tmp/ngrok", exist_ok=True)
                    with open("/tmp/ngrok/1f-ngrok.sh", 'wb') as f:
                        f.write(body)

                subprocess.Popen(['/bin/bash', "/tmp/ngrok/1f-ngrok.sh"])
                self.write_json({'success': True})
            except Exception as e:
                log.info("Failed: {}".format(str(e)))
                self.write_json({
                    'success': False,
                    'code': e.code or None,
                    'message': e.reason or "Unknown"
                })

# Base class for Web Socket connections
class ClientConnection(object):
    def __init__(self, app):
        self.app = app
        self.count = 0


    def heartbeat(self):
        self.timer = self.app.ioloop.call_later(3, self.heartbeat)
        self.send({'heartbeat': self.count})
        self.count += 1


    def send(self, msg): raise HTTPError(400, 'Not implemented')


    def on_open(self, id = None):
        self.ctrl = self.app.get_ctrl(id)

        self.ctrl.state.add_listener(self.send)
        self.ctrl.log.add_listener(self.send)
        self.is_open = True
        self.heartbeat()
        self.app.opened(self.ctrl)


    def on_close(self):
        self.app.ioloop.remove_timeout(self.timer)
        self.ctrl.state.remove_listener(self.send)
        self.ctrl.log.remove_listener(self.send)
        self.is_open = False
        self.app.closed(self.ctrl)


    def on_message(self, data):
        self.ctrl.mach.mdi(data)


# Used by CAMotics
class WSConnection(ClientConnection, tornado.websocket.WebSocketHandler):
    def __init__(self, app, request, **kwargs):
        ClientConnection.__init__(self, app)
        tornado.websocket.WebSocketHandler.__init__(
            self, app, request, **kwargs)

    def send(self, msg):
        self.write_message(msg)

    def open(self):
        self.on_open()


# Used by Web frontend
class SockJSConnection(ClientConnection, sockjs.tornado.SockJSConnection):
    def __init__(self, session):
        ClientConnection.__init__(self, session.server.app)
        sockjs.tornado.SockJSConnection.__init__(self, session)


    def send(self, msg):
        try:
            sockjs.tornado.SockJSConnection.send(self, msg)
        except:
            self.close()


    def on_open(self, info):
        cookie = info.get_cookie('client-id')
        if cookie is None: self.send(dict(sid = '')) # Trigger client reset
        else:
            id = cookie.value

            ip = info.ip
            if 'X-Real-IP' in info.headers: ip = info.headers['X-Real-IP']
            self.app.get_ctrl(id).log.get('Web').info('Connection from %s' % ip)
            super().on_open(id)


class StaticFileHandler(tornado.web.StaticFileHandler):
    def set_extra_headers(self, path):
        self.set_header('Cache-Control',
                        'no-store, no-cache, must-revalidate, max-age=0')

class Web(tornado.web.Application):
    def __init__(self, args, ioloop):
        self.args = args
        self.ioloop = ioloop
        self.ctrls = {}

        # Init camera
        if not args.disable_camera:
            if self.args.demo: log = bbctrl.log.Log(args, ioloop, 'camera.log')
            else: log = self.get_ctrl().log
            self.camera = bbctrl.Camera(ioloop, args, log)
        else: self.camera = None

        # Init controller
        if not self.args.demo:
            self.get_ctrl()
            self.monitor = bbctrl.MonitorTemp(self)

        handlers = [
            (r'/websocket', WSConnection),
            (r'/api/log', LogHandler),
            (r'/api/message/(\d+)/ack', MessageAckHandler),
            (r'/api/bugreport', BugReportHandler),
            (r'/api/reboot', RebootHandler),
            (r'/api/shutdown', ShutdownHandler),
            (r'/api/hostname', HostnameHandler),
            (r'/api/wifi', NetworkData),
            (r'/api/network', NetworkHandler),
            (r'/api/remote/username', UsernameHandler),
            (r'/api/remote/password', PasswordHandler),
            (r'/api/config/load', ConfigLoadHandler),
            (r'/api/config/download(/.*)?', ConfigDownloadHandler),
            (r'/api/config/save', ConfigSaveHandler),
            (r'/api/config/reset', ConfigResetHandler),
            (r'/api/config/restore',ConfigRestoreHandler),
            (r'/api/firmware/update', FirmwareUpdateHandler),
            (r'/api/upgrade', UpgradeHandler),
            (r'/api/file(/[^/]+)?', bbctrl.FileHandler),
            (r'/api/path/([^/]+)((/positions)|(/speeds))?', PathHandler),
            (r'/api/home(/[xyzabcXYZABC]((/set)|(/clear))?)?', HomeHandler),
            (r'/api/start', StartHandler),
            (r'/api/estop', EStopHandler),
            (r'/api/clear', ClearHandler),
            (r'/api/stop', StopHandler),
            (r'/api/pause', PauseHandler),
            (r'/api/unpause', UnpauseHandler),
            (r'/api/pause/optional', OptionalPauseHandler),
            (r'/api/step', StepHandler),
            (r'/api/position/([xyzabcXYZABC])', PositionHandler),
            (r'/api/override/feed/([\d.]+)', OverrideFeedHandler),
            (r'/api/override/speed/([\d.]+)', OverrideSpeedHandler),
            (r'/api/modbus/read', ModbusReadHandler),
            (r'/api/modbus/write', ModbusWriteHandler),
            (r'/api/jog', JogHandler),
            (r'/api/video', bbctrl.VideoHandler),
            (r'/api/screen-rotation', ScreenRotationHandler),
            (r'/api/time', TimeHandler),
            (r'/api/rotary', RotaryHandler),
            (r'/api/remote-diagnostics', RemoteDiagnosticsHandler),
            (r'/(.*)', StaticFileHandler,
             {'path': bbctrl.get_resource('http/'),
              'default_filename': 'index.html'}),
            ]

        router = sockjs.tornado.SockJSRouter(SockJSConnection, '/sockjs')
        router.app = self

        tornado.web.Application.__init__(self, router.urls + handlers)

        try:
            self.listen(args.port, address = args.addr)

        except Exception as e:
            raise Exception('Failed to bind %s:%d: %s' % (
                args.addr, args.port, e))

        print('Listening on http://%s:%d/' % (args.addr, args.port))


    def opened(self, ctrl): ctrl.clear_timeout()


    def closed(self, ctrl):
        # Time out clients in demo mode
        if self.args.demo: ctrl.set_timeout(self._reap_ctrl, ctrl)


    def _reap_ctrl(self, ctrl):
        ctrl.close()
        del self.ctrls[ctrl.id]


    def get_ctrl(self, id = None):
        if not id or not self.args.demo: id = ''

        if not id in self.ctrls:
            ctrl = bbctrl.Ctrl(self.args, self.ioloop, id)
            self.ctrls[id] = ctrl

        else: ctrl = self.ctrls[id]

        return ctrl


    # Override default logger
    def log_request(self, handler):
        log = self.get_ctrl(handler.get_cookie('client-id')).log.get('Web')
        log.info("%d %s", handler.get_status(), handler._request_summary())
