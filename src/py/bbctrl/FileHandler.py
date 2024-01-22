import os
import tempfile
import bbctrl
import glob
import tornado
from tornado import gen
from tornado.web import HTTPError
from tornado.escape import url_unescape


def safe_remove(path):
    try:
        os.unlink(path)
    except OSError:
        pass


@tornado.web.stream_request_body
class FileHandler(bbctrl.APIHandler):
    def prepare(self):
        if self.request.method == 'PUT':
            self.request.connection.set_max_body_size(2 ** 30)

            filename = self.request.path.split('/')[-1]
            self.uploadFilename = url_unescape(filename) \
                .encode("ascii", errors="replace") \
                .decode() \
                .replace('\\', '_') \
                .replace('/', '_') \
                .replace('#', '-') \
                .replace('?', '-')

            self.uploadFile = tempfile.NamedTemporaryFile("wb")

    def data_received(self, data):
        if self.request.method == 'PUT':
            self.uploadFile.write(data)

    def delete_ok(self, filename):
        allFiles = self.get_ctrl().state.return_files()

        if filename.startswith('/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE'):
            macrosList=filename.replace('/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE','')
            self.get_log('FileHandler').info('macrosList ' + macrosList).split(',')

            for filename in [item for item in allFiles if item not in macrosList]:
                filename = os.path.basename(filename)
                self.get_log('FileHandler').info('filenamed ' + filename)
                self.get_log('FileHandler').info(' self.get_upload(filename)' + self.get_upload(filename))
                safe_remove(self.get_upload(filename))
                self.get_ctrl().preplanner.delete_plans(filename)
                self.get_ctrl().state.remove_file(filename)
        
        elif not filename:
            # Delete everything
            for path in glob.glob(self.get_upload('*')):
                self.get_log('FileHandler').info('path ' + path)
                safe_remove(path)
            self.get_ctrl().preplanner.delete_all_plans()
            self.get_ctrl().state.clear_files()

        else:
            # Delete a single file
            filename = os.path.basename(filename)
            self.get_log('FileHandler').info('filenamed ' + filename)
            self.get_log('FileHandler').info(' self.get_upload(filename)' + self.get_upload(filename))
            safe_remove(self.get_upload(filename))
            self.get_ctrl().preplanner.delete_plans(filename)
            self.get_ctrl().state.remove_file(filename)

    def put_ok(self, *args):
        if not os.path.exists(self.get_upload()):
            os.mkdir(self.get_upload())

        filename = self.get_upload(self.uploadFilename).encode('utf8')
        safe_remove(filename)
        os.link(self.uploadFile.name, filename)

        self.uploadFile.close()

        del (self.uploadFile)

        self.get_ctrl().preplanner.invalidate(self.uploadFilename)
        self.get_ctrl().state.add_file(self.uploadFilename)
        self.get_log('FileHandler').info(
            'GCode received: ' + self.uploadFilename)

        del (self.uploadFilename)

    @gen.coroutine
    def get(self, filename):
        self.get_log('FileHandler').info(
            'FileName: ' + filename)
        if not filename:
            raise HTTPError(400, 'Missing filename')
        if filename.startswith('/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE'):
            filebasename = os.path.basename(url_unescape(filename.replace("EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE", "")))
        else:
            filebasename = os.path.basename(url_unescape(filename))
        
        try:
            with open(self.get_upload(filebasename).encode('utf8'), 'r') as f:
                self.write(f.read())
        except Exception:
            self.get_ctrl().state.select_file('')
            raise HTTPError(
                400, "Unable to read file - doesn't appear to be GCode.")
        if not filename.startswith('/EgZjaHJvbWUqCggBEAAYsQMYgAQyBggAEEUYOTIKCAE'):
            self.get_ctrl().state.select_file(filebasename)
