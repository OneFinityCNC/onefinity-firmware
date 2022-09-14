#pragma once

#include "spindle.h"

#include <stdbool.h>
#include <stdint.h>


void stepper_init();
void st_shutdown();
bool st_is_busy();
void st_set_power_scale(float scale);
void st_prep_power(const power_update_t powers[]);
void st_prep_line(const float target[]);
void st_prep_dwell(float seconds);
