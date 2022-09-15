## Updating the Pwr Firmware

The Pwr firmware must be uploaded manually using an ISP programmer.  With the programmer attached to the pwr chip ISP port on the controller's main board run the following:

    make -C src/pwr program

<br />

## Initializing the main AVR firmware

The main AVR microcontroller must also be programmed manually the first time.  Later it will be automatically programmed by the RPi as part of the firmware install.  To perform the initial AVR programming connect the ISP programmer to the main AVR's ISP port on the controller's main board and run the following:

    make -C src/avr init

This will set the fuses, install the bootloader and program the firmware.
