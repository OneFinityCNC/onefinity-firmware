#pragma once

#include "status.h"

#include <stdint.h>


void hw_init();
void hw_request_hard_reset();
void hw_reset_handler();

uint8_t hw_disable_watchdog();
void hw_restore_watchdog(uint8_t state);
