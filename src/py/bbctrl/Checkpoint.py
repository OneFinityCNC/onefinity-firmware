import os
import json
import time
import zlib
import hashlib
import threading

# Saves job progress so an interrupted job (power loss, E-stop, or a
# deliberate "park and power down") can be resumed later.
#
# - The record is small and is only written while a job is running, when the
#   line number has changed and at most every INTERVAL seconds.
# - Writes happen on a background thread so a slow SD card can never stall
#   the planner or the websocket.
# - Two fixed-size slots are overwritten alternately.  Each holds a checksum,
#   so a write cut short by a power loss leaves the other slot readable.
# - Everything lives in next-data/ in the controller's data directory, next to
#   config.json and the uploaded G-code.

VERSION = 1
SLOT_SIZE = 2048
INTERVAL = 10


class Checkpoint(object):
    def __init__(self, ctrl):
        self.ctrl = ctrl
        self.log = ctrl.log.get('Checkpoint')
        self.dir = ctrl.get_path('next-data')
        self.enabled = True
        self.running = False
        self.last_write = 0
        self.last_line = None
        self.file = ''
        self.sha = None
        self.nlines = None
        self.hash_for = None
        self.lock = threading.Lock()
        self.latest = None     # newest record waiting to be written
        self.writing = False
        self.seq = 0
        self.current = None

        self.reload()
        self.current = self._read_best()
        if self.current: self.seq = self.current.get('seq', 0)

        ctrl.state.add_listener(self.on_change)


    def _prefs_path(self): return os.path.join(self.dir, 'prefs.json')
    def _slot_path(self, i): return os.path.join(self.dir, 'checkpoint.%d' % i)


    # Settings -----------------------------------------------------------
    def reload(self):
        try:
            with open(self._prefs_path(), 'r', encoding = 'utf-8') as f:
                prefs = json.load(f)
            self.enabled = bool(prefs.get('progress', True))
        except (OSError, ValueError, AttributeError): self.enabled = True


    # Reading ------------------------------------------------------------
    @staticmethod
    def _decode(raw):
        try:
            head, _, body = raw.decode('utf-8').partition('\n')
            body = body.rstrip()
            if int(head, 16) != zlib.crc32(body.encode('utf-8')): return None
            rec = json.loads(body)
            return rec if rec.get('v') == VERSION else None
        except (ValueError, UnicodeDecodeError): return None


    def _read_best(self):
        best = None
        for i in (0, 1):
            try:
                with open(self._slot_path(i), 'rb') as f: rec = self._decode(f.read())
            except OSError: continue
            if rec and (best is None or rec.get('seq', 0) > best.get('seq', 0)):
                best = rec
        return best


    def get(self): return self.current


    # Recording ----------------------------------------------------------
    def _active(self):
        s = self.ctrl.state
        return (s.get('cycle') == 'running' and not s.get('dry_run', False) and
                s.get('xx') in ('RUNNING', 'HOLDING', 'STOPPING'))


    def on_change(self, update):
        try:
            if not self.enabled: return
            now = time.time()
            active = self._active()

            if active and not self.running:
                self.running = True
                self.last_line = None
                self._begin_file()
                self._record('running')

            elif active:
                line = self.ctrl.state.get('line')
                if (line != self.last_line and
                    now - self.last_write >= INTERVAL):
                    self._record('running')

            elif self.running:
                self.running = False
                xx = self.ctrl.state.get('xx')
                self._record('estop' if xx == 'ESTOPPED' else 'stopped')

        except Exception:
            self.log.exception('Checkpoint update failed')


    def _begin_file(self):
        name = self.ctrl.state.get('selected', '') or ''
        self.file = name
        self.sha = None
        self.nlines = None
        if not name: return
        path = self.ctrl.get_upload(name)

        def work():
            try:
                h = hashlib.sha256()
                n = 0
                with open(path, 'rb') as f:
                    for chunk in iter(lambda: f.read(65536), b''):
                        h.update(chunk)
                        n += chunk.count(b'\n')
                if self.file == name:
                    self.sha, self.nlines = h.hexdigest(), n
                    # Record again now that the file fingerprint is known
                    if self.running: self._record('running')
            except OSError: pass
            except Exception: self.log.exception('Could not fingerprint program')

        threading.Thread(target = work, daemon = True).start()


    def _record(self, status, extra = None):
        s = self.ctrl.state
        line = s.get('line')
        self.last_line = line
        self.last_write = time.time()
        with self.lock:
            self.seq += 1
            seq = self.seq

        rec = {
            'v': VERSION, 'seq': seq, 't': int(self.last_write),
            'status': status, 'file': self.file, 'sha': self.sha,
            'nlines': self.nlines, 'line': line,
            'tool': s.get('tool'), 'feed': s.get('feed'),
            'speed': s.get('speed'), 'metric': s.get('metric'),
            'pos': dict((a, s.get(a + 'p')) for a in 'xyzabc'),
            'offset': dict((a, s.get('offset_' + a)) for a in 'xyzabc'),
        }
        if extra: rec.update(extra)

        self.current = rec
        with self.lock: self.latest = rec
        if not self.writing:
            self.writing = True
            threading.Thread(target = self._writer, daemon = True).start()


    def _writer(self):
        try:
            while True:
                with self.lock:
                    rec, self.latest = self.latest, None
                if rec is None: break
                self._persist(rec)
        finally: self.writing = False


    def _persist(self, rec):
        try:
            if not os.path.exists(self.dir): os.makedirs(self.dir)
            body = json.dumps(rec, separators = (',', ':'))
            text = '%08x\n%s' % (zlib.crc32(body.encode('utf-8')), body)
            data = text.encode('utf-8')
            if len(data) < SLOT_SIZE: data = data.ljust(SLOT_SIZE, b' ')

            path = self._slot_path(rec['seq'] % 2)
            with open(path, 'r+b' if os.path.exists(path) else 'wb') as f:
                f.write(data)
                f.truncate(len(data))
                f.flush()
                os.fsync(f.fileno())
        except Exception:
            self.log.exception('Could not save job progress')


    # Actions ------------------------------------------------------------
    def mark(self, status):
        # Re-save the newest record with a different status, e.g. 'parked'
        if not self.current: return
        with self.lock:
            self.seq += 1
            seq = self.seq
        rec = dict(self.current, seq = seq, t = int(time.time()), status = status)
        self.current = rec
        with self.lock: self.latest = rec
        if not self.writing:
            self.writing = True
            threading.Thread(target = self._writer, daemon = True).start()


    def dismiss(self):
        # The operator has seen the interrupted job and does not want to
        # resume it.
        if self.current and self.current.get('status') != 'dismissed':
            with self.lock:
                self.seq += 1
                seq = self.seq
            rec = dict(self.current, seq = seq, t = int(time.time()),
                       status = 'dismissed')
            self.current = rec
            with self.lock: self.latest = rec
            if not self.writing:
                self.writing = True
                threading.Thread(target = self._writer, daemon = True).start()
