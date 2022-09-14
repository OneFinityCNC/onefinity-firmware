#include "seek.h"

#include "command.h"
#include "switch.h"
#include "estop.h"
#include "util.h"
#include "state.h"

#include <stdint.h>

#include "motor.h"

enum {
  SEEK_ACTIVE = 1 << 0,
  SEEK_ERROR  = 1 << 1,
  SEEK_FOUND  = 1 << 2,
};


typedef struct {
  bool active;
  switch_id_t sw;
  uint8_t flags;
} seek_t;


static seek_t seek = {false, SW_INVALID, 0};


switch_id_t seek_get_switch() {return seek.active ? seek.sw : SW_INVALID;}

bool seek_active() {
  return seek.active;
}

bool seek_switch_found() {
  if (!seek.active) return false;

  bool inactive = !(seek.flags & SEEK_ACTIVE);

  if (switch_is_active(seek.sw) ^ inactive) {
    seek.flags |= SEEK_FOUND;
    return true;
  }

  return false;
}


void seek_end() {
  switch_id_t seekMode;

  seekMode = seek_get_switch();

  if (!seek.active) return;

  if (!(SEEK_FOUND & seek.flags) && (SEEK_ERROR & seek.flags))
    STATUS_WARNING(STAT_SEEK_NOT_FOUND, "", 0);

  if((seekMode == SW_STALL_0) || (seekMode == SW_STALL_1) || (seekMode ==SW_STALL_2) || (seekMode == SW_STALL_3))
    disable_stall_microstep();
  
  seek.active = false;
}


void seek_cancel() {
  switch_id_t seekMode;

  seekMode = seek_get_switch();


  if((seekMode == SW_STALL_0) || (seekMode == SW_STALL_1) || (seekMode ==SW_STALL_2) || (seekMode == SW_STALL_3))
    disable_stall_microstep();

  seek.active = false;
}


// Command callbacks
stat_t command_seek(char *cmd) {
  switch_id_t sw = (switch_id_t)decode_hex_nibble(cmd[1]);
  if (sw <= 0) return STAT_INVALID_ARGUMENTS; // Don't allow seek to ESTOP
  if (!switch_is_enabled(sw)) return STAT_SEEK_NOT_ENABLED;

  uint8_t flags = decode_hex_nibble(cmd[2]);
  if (flags & 0xfc) return STAT_INVALID_ARGUMENTS;

  //////////////
  if(sw == SW_STALL_0) enable_stall_microstep(0);
  if(sw == SW_STALL_1) enable_stall_microstep(1);
  if(sw == SW_STALL_2) enable_stall_microstep(2);
  if(sw == SW_STALL_3) enable_stall_microstep(3);

  seek_t seek = {true, sw, flags};
  command_push(*cmd, &seek);

  return STAT_OK;
}


unsigned command_seek_size() {return sizeof(seek_t);}
void command_seek_exec(void *data) {
    //switch_id_t seekMode;

    //seekMode = seek_get_switch();

    //if((seekMode == SW_STALL_0) || (seekMode == SW_STALL_1) || (seekMode ==SW_STALL_2) || (seekMode == SW_STALL_3))
    //    enable_stall_microstep();
    
    seek = *(seek_t *)data;
}
