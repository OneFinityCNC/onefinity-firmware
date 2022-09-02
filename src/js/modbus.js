"use strict";

// Must match modbus.c
const constants = {
    DISCONNECTED: 0,
    OK: 1,
    CRC: 2,
    INVALID: 3,
    TIMEDOUT: 4
};

module.exports = {
    ...constants,
    status_to_string: function (status) {
        switch (status) {
            case constants.OK: return "Ok";
            case constants.CRC: return "CRC error";
            case constants.INVALID: return "Invalid response";
            case constants.TIMEDOUT: return "Timedout";
            default: return "Disconnected";
        }
    }
};
