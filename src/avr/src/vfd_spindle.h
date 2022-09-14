#pragma once

#include "spindle.h"


void vfd_spindle_init();
void vfd_spindle_deinit(deinit_cb_t cb);
void vfd_spindle_set(float power);
float vfd_spindle_get();
uint16_t vfd_get_status();
void vfd_spindle_rtc_callback();
