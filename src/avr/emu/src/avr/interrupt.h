#pragma once

#include "io.h"

void cli();
void sei();

#define ISR(X) void __##X()
