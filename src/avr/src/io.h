#pragma once


typedef enum {
  INPUT_IMMEDIATE,
  INPUT_RISE,
  INPUT_FALL,
  INPUT_HIGH,
  INPUT_LOW,
} input_mode_t;


void io_callback();
