#pragma once

#include "config.h"

#include <stdint.h>
#include <stdbool.h>

typedef void (*i2c_read_cb_t)(uint8_t *data, uint8_t length);
typedef uint8_t (*i2c_write_cb_t)(uint8_t offset, bool *done);


void i2c_init();
void i2c_set_read_callback(i2c_read_cb_t cb);
void i2c_set_write_callback(i2c_write_cb_t cb);
