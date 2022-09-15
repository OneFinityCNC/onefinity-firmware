# This file is very out of date, and should not be relied upon. It is preserved here, as it contains some useful information.

## Installing the RaspberryPi base system

Download the latest Buildbotics CNC controller base image and decompress it:

    wget \
      https://buildbotics.com/upload/2018-05-15-raspbian-stretch-bbctrl.img.xz
    xz -d 2018-05-15-raspbian-stretch-bbctrl.img.xz

Now copy the base system to an SD card.  You need a card with at least 8GiB.
After installing the RPi system all data on the SD card will be lost.  So make
sure you back up the SD card if there's anything important on it.

In the command below, make sure you have the correct device or you can
**destroy your Linux system** by overwriting the disk.  One way to do this is
to run ``sudo tail -f /var/log/syslog`` before inserting the SD card.  After
inserting the card look for log messages containing ``/dev/sdx`` where ``x`` is
a letter.  This should be the device name of the SD card.  Hit ``CTRL-C`` to
stop following the system log.

    sudo dd bs=4M if=2015-05-05-raspbian-wheezy.img of=/dev/sde
    sudo sync

The first command takes awhile and does not produce any output until it's done.

Insert the SD card into your RPi and power it on.  Plug in the network
connection, wired or wireless.