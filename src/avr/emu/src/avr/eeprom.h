#pragma once

#define EEMEM

#define eeprom_update_word(PTR, VAL) *(PTR) = (VAL)
#define eeprom_read_word(PTR) *(PTR)
#define eeprom_is_ready() true
