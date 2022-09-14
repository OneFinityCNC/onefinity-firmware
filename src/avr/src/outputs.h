#pragma once

#include <stdint.h>
#include <stdbool.h>


typedef enum {
  OUT_LO,
  OUT_HI,
  OUT_TRI,
} output_state_t;


/// OUT_<inactive>_<active>
typedef enum {
  OUT_DISABLED,
  OUT_LO_HI,
  OUT_HI_LO,
  OUT_TRI_LO,
  OUT_TRI_HI,
  OUT_LO_TRI,
  OUT_HI_TRI,
} output_mode_t;


void outputs_init();
bool outputs_is_active(uint8_t pin);
void outputs_set_active(uint8_t pin, bool active);
bool outputs_toggle(uint8_t pin);
void outputs_set_mode(uint8_t pin, output_mode_t mode);
output_state_t outputs_get_state(uint8_t pin);
void outputs_stop();
