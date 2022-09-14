#pragma once

#include "spindle.h"


void pwm_init();
float pwm_get();
void pwm_deinit(deinit_cb_t cb);
power_update_t pwm_get_update(float power);
void pwm_update(const power_update_t &update);
