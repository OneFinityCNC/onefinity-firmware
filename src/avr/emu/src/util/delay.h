#pragma once

#include <unistd.h>

#define _delay_ms(x) usleep((x) * 1000)
#define _delay_us(x) usleep(x)
