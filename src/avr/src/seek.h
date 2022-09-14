#pragma once

#include "switch.h"

#include <stdbool.h>


switch_id_t seek_get_switch();
bool seek_switch_found();
void seek_end();
void seek_cancel();
bool seek_active();
