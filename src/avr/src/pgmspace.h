#pragma once

#include <avr/pgmspace.h>

#ifdef __AVR__
#define PRPSTR "S"
#else
#define PRPSTR "s"
#endif
