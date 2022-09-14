#include "hardware.h"
#include "stepper.h"
#include "motor.h"
#include "switch.h"
#include "usart.h"
#include "drv8711.h"
#include "vars.h"
#include "rtc.h"
#include "report.h"
#include "command.h"
#include "estop.h"
#include "i2c.h"
#include "pgmspace.h"
#include "outputs.h"
#include "analog.h"
#include "modbus.h"
#include "io.h"
#include "exec.h"
#include "state.h"
#include "emu.h"

#include <avr/wdt.h>

#include <stdio.h>
#include <stdbool.h>
#include <util/delay.h>


// For emu
int __argc;
char **__argv;


int main(int argc, char *argv[]) {
  __argc = argc;
  __argv = argv;

  

  // Init
  cli();                          // disable interrupts

  emu_init();                     // Init emulator
  hw_init();                      // hardware setup - must be first
  
  _delay_ms(5000);		  //2 seconds to charge capacitor banks, 1 second for shunt test, 2 seconds to recharge banks

  wdt_enable(WDTO_250MS);

  outputs_init();                 // output pins
  switch_init();                  // switches
  estop_init();                   // emergency stop handler
  analog_init();                  // analog input pins
  usart_init();                   // serial port
  i2c_init();                     // i2c port
  drv8711_init();                 // motor drivers
  stepper_init();                 // steppers
  motor_init();                   // motors
  exec_init();                    // motion exec
  vars_init();                    // configuration variables
  command_init();                 // command queue

  sei();                          // enable interrupts

  // Splash
  printf_P(PSTR("\n{\"firmware\":\"Buildbotics AVR\"}\n"));

  // Main loop
  while (true) {
    emu_callback();               // Emulator callback
    hw_reset_handler();           // handle hard reset requests
    state_callback();             // manage state
    command_callback();           // process next command
    modbus_callback();            // handle modbus events
    io_callback();                // handle io input
    report_callback();            // report changes
  }

  return 0;
}
