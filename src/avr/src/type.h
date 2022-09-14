#pragma once

#include "pgmspace.h"
#include "status.h"

#include <stdint.h>
#include <stdbool.h>


// Define types
#define TYPEDEF(TYPE, DEF) typedef DEF TYPE;
#include "type.def"
#undef TYPEDEF

typedef enum {
#define TYPEDEF(TYPE, ...) TYPE_##TYPE,
#include "type.def"
#undef TYPEDEF
} type_t;


typedef union {
#define TYPEDEF(TYPE, ...) TYPE _##TYPE;
#include "type.def"
#undef TYPEDEF
} type_u;


// Define functions
#define TYPEDEF(TYPE, DEF)                                  \
  pstr type_get_##TYPE##_name_pgm();                        \
  bool type_eq_##TYPE(TYPE a, TYPE b);                      \
  TYPE type_parse_##TYPE(const char *s, stat_t *status);    \
  void type_print_##TYPE(TYPE x);
#include "type.def"
#undef TYPEDEF


type_u type_parse(type_t type, const char *s, stat_t *status);
void type_print(type_t type, type_u value);
