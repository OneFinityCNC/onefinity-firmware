#pragma once

#include <stdint.h>
#include <stdbool.h>


unsigned b64_encoded_length(unsigned len, bool pad);
void b64_encode(const uint8_t *in, unsigned len, char *out, bool pad);
bool b64_decode(const char *in, unsigned len, uint8_t *out);
bool b64_decode_float(const char *s, float *f);
