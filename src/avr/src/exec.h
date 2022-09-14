#pragma once


#include "config.h"
#include "spindle.h"
#include "status.h"

#include <stdbool.h>
#include <stdint.h>


typedef stat_t (*exec_cb_t)();


void exec_init();

void exec_get_position(float p[AXES]);
float exec_get_axis_position(int axis);
float exec_get_power_scale();
void exec_set_velocity(float v);
float exec_get_velocity();
void exec_set_acceleration(float a);
float exec_get_acceleration();
void exec_set_jerk(float j);

void exec_set_cb(exec_cb_t cb);

void exec_move_to_target(const float target[]);
stat_t exec_segment(float time, const float target[], float vel, float accel,
                    float maxAccel, float maxJerk,
                    const power_update_t power_updates[]);
stat_t exec_next();
