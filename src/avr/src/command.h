#pragma once

#include "config.h"
#include "status.h"

#include <stdbool.h>
#include <stdint.h>


// Commands
typedef enum {
#define CMD(CODE, NAME, ...) COMMAND_##NAME = CODE,
#include "command.def"
#undef CMD
} command_t;


void command_init();
bool command_is_active();
unsigned command_get_count();
void command_print_json();
void command_flush_queue();
void command_push(char code, void *data);
bool command_callback();
void command_set_axis_position(int axis, const float p);
void command_set_position(const float position[AXES]);
void command_get_position(float position[AXES]);
void command_reset_position();
char command_peek();
uint8_t *command_next();
bool command_exec();
