#pragma once

#include "status.h"

#include <stdint.h>
#include <stdbool.h>


typedef enum {
  MOTOR_DISABLED,                 // motor enable is deactivated
  MOTOR_ALWAYS_POWERED,           // motor is always powered while machine is ON
  MOTOR_POWERED_IN_CYCLE,         // motor fully powered during cycles,
                                  // de-powered out of cycle
  MOTOR_POWERED_ONLY_WHEN_MOVING, // idles shortly after stopped, even in cycle
} motor_power_mode_t;


void motor_init();

bool motor_is_enabled(int motor);
int motor_get_axis(int motor);
void motor_set_position(int motor, float position);
float motor_get_soft_limit(int motor, bool min);
bool motor_get_homed(int motor);

stat_t motor_rtc_callback();

void motor_end_move(int motor);
void motor_load_move(int motor);
void motor_prep_move(int motor, float target);

void enable_stall_microstep(int m);
void disable_stall_microstep();

