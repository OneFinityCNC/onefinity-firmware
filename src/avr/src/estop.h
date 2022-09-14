#pragma once

#include "status.h"

#include <stdbool.h>


void estop_init();
bool estop_triggered();
void estop_trigger(stat_t reason);
void estop_clear();


#define ESTOP_ASSERT(COND, CODE)                    \
  do {if (!(COND)) estop_trigger(CODE);} while (0)
