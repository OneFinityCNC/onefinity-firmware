CROSS:=arm-linux-gnueabihf-
DIR:=$(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))
obj-m:=bbserial.o
ccflags-y:=-std=gnu99 -Wno-declaration-after-statement

KPKG=raspberrypi-kernel_1.20171029-1.tar.gz
KURL=https://github.com/dbrgn/linux-rpi/archive/$(KPKG)
KDIR=/tmp/rpi-kernel
export KERNEL=kernel7

KOPTS=ARCH=arm CROSS_COMPILE=$(CROSS) -C $(KDIR)

all: $(KDIR)
	$(MAKE) $(KOPTS) M=$(DIR) modules

$(KDIR): $(KPKG)
	rm -rf $(KDIR)
	mkdir -p $(KDIR)
	tar xf $(KPKG) -C $(KDIR) --strip-components 1
	$(MAKE) $(KOPTS) bcm2709_defconfig
	$(MAKE) $(KOPTS) modules_prepare

$(KPKG):
	wget $(KURL)

clean:
	$(MAKE) $(KOPTS) M=$(DIR) clean
	rm -rf $(KDIR) $(KPKG)
