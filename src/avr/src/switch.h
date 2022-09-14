#pragma once


#include "config.h"

#include <stdint.h>
#include <stdbool.h>


// macros for finding the index into the switch table give the axis number
#define MIN_SWITCH(axis) ((switch_id_t)(2 + axis * 2))
#define MAX_SWITCH(axis) ((switch_id_t)(2 + axis * 2 + 1))


typedef enum {
  SW_DISABLED,
  SW_NORMALLY_OPEN,
  SW_NORMALLY_CLOSED,
} switch_type_t;


/// Switch IDs
typedef enum {
  SW_INVALID = -1,
  SW_ESTOP, SW_PROBE,
  SW_MIN_0, SW_MAX_0,
  SW_MIN_1, SW_MAX_1,
  SW_MIN_2, SW_MAX_2,
  SW_MIN_3, SW_MAX_3,
  SW_STALL_0, SW_STALL_1,
  SW_STALL_2, SW_STALL_3,
  SW_MOTOR_FAULT,
} switch_id_t;


typedef void (*switch_callback_t)(switch_id_t sw, bool active);


void switch_init();
void switch_rtc_callback();
bool switch_is_active(switch_id_t sw);
bool switch_is_enabled(switch_id_t sw);
switch_type_t switch_get_type(switch_id_t sw);
void switch_set_type(switch_id_t sw, switch_type_t type);
void switch_set_callback(switch_id_t sw, switch_callback_t cb);
