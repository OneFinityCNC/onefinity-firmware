#pragma once

#define PRPSTR "s"
#define PROGMEM
#define PGM_P const char *
#define PSTR(X) X
#define vfprintf_P vfprintf
#define printf_P printf
#define puts_P puts
#define sprintf_P sprintf
#define strcmp_P strcmp
#define pgm_read_ptr(x) *(x)
#define pgm_read_word(x) *(x)
#define pgm_read_byte(x) *(x)
