from tornado import gen
from tornado.httpclient import AsyncHTTPClient, HTTPRequest, HTTPResponse
from tornado.web import HTTPError
import bbctrl
import datetime
import iw_parse
import json
import os
import re
import socket
import sockjs.tornado
import subprocess
import tempfile
import tornado


def call_get_output(cmd):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    s = p.communicate()[0].decode('utf-8')
    if p.returncode:
        raise HTTPError(400, 'Command failed')
    return s


class RebootHandler(bbctrl.APIHandler):

    def put_ok(self):
        subprocess.Popen(['reboot'])


class ShutdownHandler(bbctrl.APIHandler):

    def put_ok(self):
        subprocess.Popen(['shutdown', '-h', 'now'])


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
        import tarfile
        import io

        buf = io.BytesIO()
        tar = tarfile.open(mode='w:bz2', fileobj=buf)

        def check_add(path, arcname=None):
            if os.path.isfile(path):
                if arcname is None:
                    arcname = path
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

    def put(self):
        if self.get_ctrl().args.demo:
            raise HTTPError(400, 'Cannot set hostname in demo mode')

        if 'hostname' in self.json:
            if subprocess.call(
                ['/usr/local/bin/sethostname',
                 self.json['hostname'].strip()]) == 0:
                self.write_json('ok')
                return

        raise HTTPError(400, 'Failed to set hostname')


class NetworkHandler(bbctrl.APIHandler):

    def get(self):
        try:
            ipAddresses = call_get_output(['hostname', '-I']).split()
        except:
            ipAddresses = ""

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


class ConfigLoadHandler(bbctrl.APIHandler):

    def get(self):
        self.write_json(self.get_ctrl().config.load())


class ConfigDownloadHandler(bbctrl.APIHandler):

    def set_default_headers(self):
        fmt = socket.gethostname() + '-%Y%m%d.json'
        filename = datetime.date.today().strftime(fmt)
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition',
                        'attachment; filename="%s"' % filename)

    def get(self):
        self.write_json(self.get_ctrl().config.load(), pretty=True)


class ConfigSaveHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().config.save(self.json)


class ConfigResetHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().config.reset()


class FirmwareUpdateHandler(bbctrl.APIHandler):

    def prepare(self):
        pass

    def put_ok(self):
        if not 'firmware' in self.request.files:
            raise HTTPError(401, 'Missing "firmware"')

        firmware = self.request.files['firmware'][0]

        if not os.path.exists('firmware'):
            os.mkdir('firmware')

        with open('firmware/update.tar.bz2', 'wb') as f:
            f.write(firmware['body'])

        subprocess.Popen(['/usr/local/bin/update-bbctrl'])


class UpgradeDownloader(object):
    updateFilePath = "/var/lib/bbctrl/firmware/update.tar.bz2"
    tempFile = None
    client = None
    ctrl = None
    errored = False
    info = {}

    def _update_info(self, *args, **kwargs):
        if self.ctrl is None:
            return

        self.info = {**self.info, **kwargs}
        self.ctrl.state.set("firmware_download", self.info)

    def _on_response(self, response: HTTPResponse):
        try:
            if response.error is not None:
                self._update_info(failed=True)

                self.ctrl and self.ctrl.log.get('UpgradeHandler').info(
                    "Firmware upgrade download failed: {}".format(
                        response.error))

                return

            os.makedirs(os.path.dirname(self.updateFilePath), exist_ok=True)

            try:
                os.unlink(self.updateFilePath)
            except OSError:
                pass

            os.link(self.tempFile.name, self.updateFilePath)

            self._update_info(complete=True)

            # Delay launching the update for 2 seconds, to allow
            # the state variable updates to be sent to clients
            self.ctrl.ioloop.call_later(
                2, lambda: subprocess.Popen(['/usr/local/bin/update-bbctrl']))
        finally:
            self._cleanup()

    def _on_chunk(self, chunk: bytes):
        if self.tempFile is None:
            raise Exception("No tempfile, aborting")

        self._update_info(bytes=self.info['bytes'] + len(chunk))
        self.tempFile.write(chunk)

    def _on_header(self, header: str):
        match = re.match(r"^\s*([^:]+):\s*(\S+)\s*$", header)
        if match and match.group(1).lower() == "content-length":
            self._update_info(size=int(match.group(2)))

    def _cleanup(self):
        if self.client:
            self.client.close()
            self.client = None

        if self.tempFile:
            self.tempFile.close()
            self.tempFile = None

        self.ctrl = None

    def cancel(self):
        self._cleanup()

    def download(self, ctrl, version):
        if self.client is not None:
            raise HTTPError(400, 'An upgrade is already in progress')

        self.ctrl = ctrl
        self.errored = False
        self._update_info(size=0, bytes=0, complete=False, failed=False)
        self.tempFile = tempfile.NamedTemporaryFile("wb")

        url = 'https://raw.githubusercontent.com/OneFinityCNC/onefinity-release/master/onefinity-{}.tar.bz2'.format(
            version)

        self.client = AsyncHTTPClient(force_instance=True)
        self.client.configure(None, max_body_size=1e9)
        downloadRequest = HTTPRequest(url,
                                      streaming_callback=self._on_chunk,
                                      header_callback=self._on_header,
                                      request_timeout=0)
        self.client.fetch(downloadRequest, self._on_response)


class UpgradeHandler(bbctrl.APIHandler):
    downloader = UpgradeDownloader()

    def put_ok(self):
        if self.json.get("cancel", False):
            self.downloader.cancel()
            return

        version = self.json.get("version")
        if version is None:
            raise HTTPError(400, "Missing version parameter")

        self.downloader.download(self.get_ctrl(), version)


class PathHandler(bbctrl.APIHandler):

    @gen.coroutine
    def get(self, filename, dataType, *args):
        if not os.path.exists(self.get_upload(filename)):
            raise HTTPError(404, 'File not found')

        preplanner = self.get_ctrl().preplanner
        future = preplanner.get_plan(filename)

        try:
            delta = datetime.timedelta(seconds=1)
            data = yield gen.with_timeout(delta, future)

        except gen.TimeoutError:
            progress = preplanner.get_plan_progress(filename)
            self.write_json(dict(progress=progress))
            return

        try:
            if data is None:
                return
            meta, positions, speeds = data

            if dataType == '/positions':
                data = positions
            elif dataType == '/speeds':
                data = speeds
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

        except tornado.iostream.StreamClosedError as e:
            pass


class HomeHandler(bbctrl.APIHandler):

    def put_ok(self, axis, action, *args):
        if axis is not None:
            axis = ord(axis[1:2].lower())

        if action == '/set':
            if not 'position' in self.json:
                raise HTTPError(400, 'Missing "position"')

            self.get_ctrl().mach.home(axis, self.json['position'])

        elif action == '/clear':
            self.get_ctrl().mach.unhome(axis)
        else:
            self.get_ctrl().mach.home(axis)


class StartHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.start()


class EStopHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.estop()


class ClearHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.clear()


class StopHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.stop()


class PauseHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.pause()


class UnpauseHandler(bbctrl.APIHandler):

    def put_ok(self):
        self.get_ctrl().mach.unpause()


class PositionHandler(bbctrl.APIHandler):

    def put_ok(self, axis):
        self.get_ctrl().mach.set_position(axis, float(self.json['position']))


class OverrideFeedHandler(bbctrl.APIHandler):

    def put_ok(self, value):
        self.get_ctrl().mach.override_feed(float(value))


class OverrideSpeedHandler(bbctrl.APIHandler):

    def put_ok(self, value):
        self.get_ctrl().mach.override_speed(float(value))


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

            if ts < last:
                return  # Out of order

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
        timezones = call_get_output(
            ['timedatectl', 'list-timezones', '--no-pager'])
        self.get_log('TimeHandler').info('Time stuff: {}, {}'.format(
            timeinfo, timezones))

        self.write_json({'timeinfo': timeinfo, 'timezones': timezones})

    def put_ok(self):
        datetime = self.json['datetime']
        timezone = self.json['timezone']
        subprocess.Popen(['timedatectl', 'set-time', datetime])
        subprocess.Popen(['timedatectl', 'set-timezone', timezone])


class RemoteDiagnosticsHandler(bbctrl.APIHandler):
    scriptFilePath = "/tmp/ngrok/1f-ngrok.sh"
    downloadRequest = None
    log = None

    def _on_response(self, response: HTTPResponse):
        try:
            os.makedirs(os.path.dirname(self.scriptFilePath), exist_ok=True)
            with open(self.scriptFilePath, 'wb') as f:
                f.write(response.body)

            subprocess.Popen(['/bin/bash', self.scriptFilePath])
        except Exception as err:
            self.log.error(
                "Remote diagnostics download failed: {}".format(err))
        finally:
            self.downloadRequest = None

    def get(self):
        if self.log is None:
            self.log = self.get_log('RemoteDiagnostics')

        code = self.get_query_argument("code", "")
        command = self.get_query_argument("command", "")

        if command == "disconnect":
            subprocess.Popen(['killall', 'ngrok'])
            self.write_json({'message': "Succesfully disconnected"})

        if command == "connect":
            if self.downloadRequest is not None:
                raise HTTPError(
                    400, 'Remote diagnostics download is already in progress')

            url = 'https://tinyurl.com/1f-remote?code={}'.format(code)
            client = AsyncHTTPClient()
            client.configure(None, max_body_size=1e9)
            self.downloadRequest = HTTPRequest(url)
            client.fetch(self.downloadRequest, self._on_response)
            self.write_json({'success': True})


# Base class for Web Socket connections
class ClientConnection(object):

    def __init__(self, app):
        self.app = app
        self.count = 0

    def heartbeat(self):
        self.timer = self.app.ioloop.call_later(3, self.heartbeat)
        self.send({'heartbeat': self.count})
        self.count += 1

    def send(self, msg):
        raise HTTPError(400, 'Not implemented')

    def on_open(self, id=None):
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
        tornado.websocket.WebSocketHandler.__init__(self, app, request,
                                                    **kwargs)

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
        if cookie is None:
            self.send(dict(sid=''))  # Trigger client reset
        else:
            id = cookie.value

            ip = info.ip
            if 'X-Real-IP' in info.headers:
                ip = info.headers['X-Real-IP']
            self.app.get_ctrl(id).log.get('Web').info('Connection from %s' %
                                                      ip)
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
            if self.args.demo:
                log = bbctrl.log.Log(args, ioloop, 'camera.log')
            else:
                log = self.get_ctrl().log
            self.camera = bbctrl.Camera(ioloop, args, log)
        else:
            self.camera = None

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
            (r'/api/network', NetworkHandler),
            (r'/api/config/load', ConfigLoadHandler),
            (r'/api/config/download', ConfigDownloadHandler),
            (r'/api/config/save', ConfigSaveHandler),
            (r'/api/config/reset', ConfigResetHandler),
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
            (r'/api/position/([xyzabcXYZABC])', PositionHandler),
            (r'/api/override/feed/([\d.]+)', OverrideFeedHandler),
            (r'/api/override/speed/([\d.]+)', OverrideSpeedHandler),
            (r'/api/modbus/read', ModbusReadHandler),
            (r'/api/modbus/write', ModbusWriteHandler),
            (r'/api/jog', JogHandler),
            (r'/api/video', bbctrl.VideoHandler),
            (r'/api/screen-rotation', ScreenRotationHandler),
            (r'/api/time', TimeHandler),
            (r'/api/remote-diagnostics', RemoteDiagnosticsHandler),
            (r'/(.*)', StaticFileHandler, {
                'path': bbctrl.get_resource('http/'),
                'default_filename': 'index.html'
            }),
        ]

        router = sockjs.tornado.SockJSRouter(SockJSConnection, '/sockjs')
        router.app = self

        tornado.web.Application.__init__(self, router.urls + handlers)

        try:
            self.listen(args.port, address=args.addr)

        except Exception as e:
            raise Exception('Failed to bind %s:%d: %s' %
                            (args.addr, args.port, e))

        print('Listening on http://%s:%d/' % (args.addr, args.port))

    def opened(self, ctrl):
        ctrl.clear_timeout()

    def closed(self, ctrl):
        # Time out clients in demo mode
        if self.args.demo:
            ctrl.set_timeout(self._reap_ctrl, ctrl)

    def _reap_ctrl(self, ctrl):
        ctrl.close()
        del self.ctrls[ctrl.id]

    def get_ctrl(self, id=None):
        if not id or not self.args.demo:
            id = ''

        if not id in self.ctrls:
            ctrl = bbctrl.Ctrl(self.args, self.ioloop, id)
            self.ctrls[id] = ctrl

        else:
            ctrl = self.ctrls[id]

        return ctrl

    # Override default logger

    def log_request(self, handler):
        log = self.get_ctrl(handler.get_cookie('client-id')).log.get('Web')
        log.info("%d %s", handler.get_status(), handler._request_summary())
