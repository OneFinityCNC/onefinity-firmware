#!/bin/bash

UPDATE_AVR=true
UPDATE_PY=true
REBOOT=false

while [ $# -gt 0 ]; do
    case "$1" in
        --no-avr) UPDATE_AVR=false ;;
        --no-py) UPDATE_PY=false ;;
    esac
    shift 1
done


if $UPDATE_PY; then
    systemctl stop bbctrl

    # Update service
    rm -f /etc/init.d/bbctrl
    cp scripts/bbctrl.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable bbctrl
fi

if $UPDATE_AVR; then
    chmod +x ./scripts/avr109-flash.py
    ./scripts/avr109-flash.py src/avr/bbctrl-avr-firmware.hex
fi

# Update config.txt
./scripts/edit-boot-config max_usb_current=1 config_hdmi_boost=8 hdmi_force_hotplug=1 hdmi_group=2 hdmi_mode=82

# TODO Enable GPU
#./scripts/edit-boot-config dtoverlay=vc4-kms-v3d
#./scripts/edit-boot-config gpu_mem=16
#chmod ug+s /usr/lib/xorg/Xorg

# Use the full screen resolution
# grep "^framebuffer_width=1280$" /boot/config.txt >/dev/null
# if [ $? -eq 0 ]; then
#     mount -o remount,rw /boot &&
#     sed -i 's/^\(framebuffer_.*\)$/#\1/g' /boot/config.txt
#     mount -o remount,ro /boot
#     REBOOT=true
# fi

# Fix camera
grep dwc_otg.fiq_fsm_mask /boot/cmdline.txt >/dev/null
if [ $? -ne 0 ]; then
    mount -o remount,rw /boot &&
    sed -i 's/\(.*\)/\1 dwc_otg.fiq_fsm_mask=0x3/' /boot/cmdline.txt
    mount -o remount,ro /boot
    REBOOT=true
fi

# Enable memory cgroups
grep cgroup_memory /boot/cmdline.txt >/dev/null
if [ $? -ne 0 ]; then
    mount -o remount,rw /boot &&
    sed -i 's/\(.*\)/\1 cgroup_memory=1/' /boot/cmdline.txt
    mount -o remount,ro /boot
    REBOOT=true
fi

# Remove Hawkeye
if [ -e /etc/init.d/hawkeye ]; then
    apt-get remove --purge -y hawkeye
fi

# Decrease boot delay
sed -i 's/^TimeoutStartSec=.*$/TimeoutStartSec=1/' \
    /etc/systemd/system/network-online.target.wants/networking.service

# Change to US keyboard layout
sed -i 's/^XKBLAYOUT="gb"$/XKBLAYOUT="us" # Comment stops change on upgrade/' \
    /etc/default/keyboard

# Setup USB stick automount
diff ./scripts/11-automount.rules /etc/udev/rules.d/11-automount.rules \
     >/dev/null
if [ $? -ne 0 ]; then
  cp ./scripts/11-automount.rules /etc/udev/rules.d/
  sed -i 's/^\(MountFlags=slave\)/#\1/' \
      /lib/systemd/system/systemd-udevd.service
  REBOOT=true
fi

# Increase swap
grep 'CONF_SWAPSIZE=1000' /etc/dphys-swapfile >/dev/null
if [ $? -ne 0 ]; then
    sed -i 's/^CONF_SWAPSIZE=.*$/CONF_SWAPSIZE=1000/' /etc/dphys-swapfile
    REBOOT=true
fi

# Install .Xresources & .xinitrc
cp scripts/Xresources ~pi/.Xresources
chown pi:pi ~pi/.Xresources
cp scripts/xinitrc ~pi/.xinitrc
chmod +x ~pi/.xinitrc
chown pi:pi ~pi/.xinitrc

#Configure the "ratpoison" window manager
if [ ! -e ~pi/.ratpoisonrc ]; then
    cp scripts/ratpoisonrc ~pi/.ratpoisonrc
    chmod 644 ~pi/.ratpoisonrc
    chown pi:pi ~pi/.ratpoisonrc
fi

# Install bbserial
MODSRC=src/bbserial/bbserial.ko
MODDST=/lib/modules/$(uname -r)/kernel/drivers/tty/serial/bbserial.ko
diff -q $MODSRC $MODDST 2>/dev/null >/dev/null
if [ $? -ne 0 ]; then
    cp $MODSRC $MODDST
    depmod
    REBOOT=true
fi

# Install rc.local
cp scripts/rc.local /etc/

# Install bbctrl
if $UPDATE_PY; then
    service bbctrl stop

    rm -rf /usr/local/lib/python*/dist-packages/bbctrl-*

    # Ensure python dependencies are installed
    pip3 install --no-index --find-links python-packages -r requirements.txt

    ./setup.py install --force

    HTTP_DIR=$(find /usr/local/lib/ -type d -name "http")
    chmod 777 $HTTP_DIR

    service bbctrl restart
fi

# Expand the file system if necessary
chmod +x ./scripts/resize_root_fs.sh
./scripts/resize_root_fs.sh
if [ $? -eq 0 ]; then
    REBOOT=true
fi

# Install our logrotate config
cp ./scripts/bbctrl-logrotate /etc/logrotate.d/bbctrl
chown root:root /etc/logrotate.d/bbctrl

# Ensure logrotate runs on every boot (for systems with no network, thus bad clock)
if [ ! -e /etc/cron.d/reboot ]; then
    cp ./scripts/cron_d_reboot /etc/cron.d/reboot
    mkdir -p /etc/cron.reboot
    cp ./scripts/cron_reboot_logrotate /etc/cron.reboot/logrotate
fi

# Delete some cookies that were left behind in older images
chmod +x ./scripts/delete-cookies.py
./scripts/delete-cookies.py
pkill -HUP chromium # Force Chromium to restart, to see the cookie changes

# Get rid of some old files that were left behind in older images
rm -rf /home/pi/hostinfo.txt
rm -rf /home/pi/ssidinfo.txt
rm -rf /home/Downloads/bbctrl-20200415.json
rm -rf /home/bbmc/bbctrl-1.0.0.tar.bz2
rm -rf /home/bbmc/hostinfo.sh
rm -rf /home/bbmc/index.html
rm -rf /home/bbmc/favicon.ico

# Force a logrotate to get everything into a good state
logrotate -f /etc/logrotate.conf

sync

if $REBOOT; then
    echo "Rebooting"
    reboot
fi

echo "Install complete"
