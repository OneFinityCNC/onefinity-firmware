#pragma once


#include <stdint.h>
#include <stdbool.h>

void rtc_init();
uint32_t rtc_get_time();
int32_t rtc_diff(uint32_t t);
bool rtc_expired(uint32_t t);
