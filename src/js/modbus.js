"use strict";

// Must match modbus.c
const exports = {
    DISCONNECTED: 0,
    OK: 1,
    CRC: 2,
    INVALID: 3,
    TIMEDOUT: 4
};

exports.status_to_string =
  function (status) {
      switch (status) {
          case exports.OK: return "Ok";
          case exports.CRC: return "CRC error";
          case exports.INVALID: return "Invalid response";
          case exports.TIMEDOUT: return "Timedout";
          default: return "Disconnected";
      }
  };

module.exports = exports;
