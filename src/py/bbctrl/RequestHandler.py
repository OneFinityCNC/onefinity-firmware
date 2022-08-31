from tornado.web import HTTPError
import bbctrl
import tornado.web
import traceback


class RequestHandler(tornado.web.RequestHandler):

    def __init__(self, app, request, **kwargs):
        super().__init__(app, request, **kwargs)
        self.app = app

    def get_ctrl(self):
        return self.app.get_ctrl(self.get_cookie('client-id'))

    def get_log(self, name='API'):
        return self.get_ctrl().log.get(name)

    def get_path(self, path=None, filename=None):
        return self.get_ctrl().get_path(path, filename)

    def get_upload(self, filename=None):
        return self.get_ctrl().get_upload(filename)

    # Override exception logging
    def log_exception(self, typ, value, tb):
        if (isinstance(value, HTTPError) and 400 <= value.status_code
                and value.status_code < 500):
            return

        log = self.get_log()
        log.set_level(bbctrl.log.DEBUG)

        log.error(str(value))
        trace = ''.join(traceback.format_exception(typ, value, tb))
        log.debug(trace)
