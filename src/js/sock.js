"use strict";

const Sock = function (url, retry, timeout) {
    if (!(this instanceof Sock)) {
        return new Sock(url, retry);
    }

    if (typeof retry == "undefined") {
        retry = 2000;
    }
    if (typeof timeout == "undefined") {
        timeout = 16000;
    }

    this.url = url;
    this.retry = retry;
    this.timeout = timeout;
    this.divisions = 4;
    this.count = 0;

    this.connect();
};

Sock.prototype.onmessage = function () {
    // Ignore
};

Sock.prototype.onopen = function () {
    // Ignore
};

Sock.prototype.onclose = function () {
    // Ignore
};

Sock.prototype.connect = function () {
    console.debug("connecting to", this.url);
    this.close();

    this._sock = new SockJS(this.url);

    this._sock.onmessage = function (e) {
        console.debug("msg:", e.data);
        this.heartbeat("msg");
        this.onmessage(e);
    }.bind(this);

    this._sock.onopen = function () {
        console.debug("connected");
        this.heartbeat("open");
        this.onopen();
    }.bind(this);

    this._sock.onclose = function () {
        console.debug("disconnected");
        this._cancel_timeout();

        this.onclose();
        if (typeof this._sock != "undefined") {
            setTimeout(this.connect.bind(this), this.retry);
        }
    }.bind(this);
};

Sock.prototype._timedout = function () {
    // Divide timeout so slow browser doesn't trigger timeouts when the
    // connection is good.
    if (this.divisions <= ++this.count) {
        console.debug("connection timedout");
        this._timeout = undefined;
        this._sock.close();

    } else {
        this._set_timeout();
    }
};

Sock.prototype._cancel_timeout = function () {
    clearTimeout(this._timeout);
    this._timeout = undefined;
    this.count = 0;
};

Sock.prototype._set_timeout = function () {
    this._timeout = setTimeout(this._timedout.bind(this),
        this.timeout / this.divisions);
};

Sock.prototype.heartbeat = function () {
    this._cancel_timeout();
    this._set_timeout();
};

Sock.prototype.close = function () {
    if (typeof this._sock != "undefined") {
        const sock = this._sock;
        this._sock = undefined;
        sock.close();
    }
};

Sock.prototype.send = function (msg) {
    this._sock.send(msg);
};

module.exports = Sock;
