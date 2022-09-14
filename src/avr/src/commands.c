#include "config.h"
#include "stepper.h"
#include "command.h"
#include "vars.h"
#include "base64.h"
#include "hardware.h"
#include "report.h"
#include "exec.h"

#include <stdio.h>


stat_t command_dwell(char *cmd) {
  float seconds;
  if (!b64_decode_float(cmd + 1, &seconds)) return STAT_BAD_FLOAT;
  command_push(*cmd, &seconds);
  return STAT_OK;
}


static stat_t _dwell_exec() {
  exec_set_cb(0); // Immediately clear the callback
  return STAT_OK;
}


unsigned command_dwell_size() {return sizeof(float);}


void command_dwell_exec(void *seconds) {
  st_prep_dwell(*(float *)seconds);
  exec_set_cb(_dwell_exec); // Command must set an exec callback
}


stat_t command_help(char *cmd) {
  printf_P(PSTR("\n{\"commands\":{"));
  command_print_json();
  printf_P(PSTR("},\"variables\":{"));
  vars_print_json();
  printf_P(PSTR("}}\n"));

  return STAT_OK;
}


stat_t command_reboot(char *cmd) {
  hw_request_hard_reset();
  return STAT_OK;
}


stat_t command_dump(char *cmd) {
  report_request_full();
  return STAT_OK;
}
