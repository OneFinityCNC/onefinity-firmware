#pragma once

#include "status.h"

#include <stdbool.h>


float var_decode_float(const char *value);
bool var_parse_bool(const char *value);

void vars_init();

void vars_report(bool full);
void vars_report_all(bool enable);
void vars_report_var(const char *code, bool enable);
stat_t vars_print(const char *name);
stat_t vars_set(const char *name, const char *value);
void vars_print_json();
