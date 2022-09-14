#pragma once

#include "config.h"

#include <stdbool.h>


enum {
  AXIS_X, AXIS_Y, AXIS_Z,
  AXIS_A, AXIS_B, AXIS_C,
};


bool axis_is_enabled(int axis);
int axis_get_id(char axis);
int axis_get_motor(int axis);
bool axis_get_homed(int axis);
float axis_get_soft_limit(int axis, bool min);
void axis_map_motors();

float axis_get_velocity_max(int axis);
float axis_get_accel_max(int axis);
float axis_get_jerk_max(int axis);
