#!/bin/bash

UPDATE_AVR=true
UPDATE_PY=true
REBOOT=false

remove_services() {
    for service in "$@"
    do
        systemctl stop "${service}.service"
        systemctl disable "${service}.service"
        find /etc/systemd -name "${service}.service" -exec rm -f {} \;
    done
}

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
    cp ./installer/config/bbctrl.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable bbctrl
fi

if $UPDATE_AVR; then
    chmod +x ./installer/scripts/avr109-flash.py
    ./installer/scripts/avr109-flash.py src/avr/bbctrl-avr-firmware.hex
fi

# Set a default time-zone, if one has not been set
timedatectl | grep 'Time zone: Etc/UTC' >/dev/null
if [ $? -eq 0 ]; then
    timedatectl set-timezone America/Los_Angeles
fi

# Update /boot/config.txt
./installer/scripts/edit-boot-config \
    disable_overscan=1 \
    framebuffer_width=1280 \
    framebuffer_height=720 \
    nohz=on \
    dtparam=sd_overclock=100 \
    max_usb_current=1 \
    config_hdmi_boost=8 \
    disable_splash=1 \
    hdmi_force_hotplug=1

./installer/scripts/edit-boot-config --only-if-not-set \
    hdmi_group=1 \
    hdmi_mode=4

# TODO Enable GPU
#./installer/scripts/edit-boot-config \
#    dtoverlay=vc4-kms-v3d \
#    gpu_mem=16
#chmod ug+s /usr/lib/xorg/Xorg

# Fix camera
grep dwc_otg.fiq_fsm_mask /boot/cmdline.txt >/dev/null
if [ $? -ne 0 ]; then
    mount -o remount,rw /boot &&
    sed -i -E 's/(.*)/\1 dwc_otg.fiq_fsm_mask=0x3/' /boot/cmdline.txt
    mount -o remount,ro /boot
    REBOOT=true
fi

# Enable memory cgroups
grep cgroup_memory /boot/cmdline.txt >/dev/null
if [ $? -ne 0 ]; then
    mount -o remount,rw /boot &&
    sed -i -E 's/(.*)/\1 cgroup_memory=1/' /boot/cmdline.txt
    mount -o remount,ro /boot
    REBOOT=true
fi

# Remove Hawkeye
if [ -e /etc/init.d/hawkeye ]; then
    apt-get purge -y hawkeye
fi

# Decrease boot delay
sed -i -E 's/^TimeoutStartSec=.*$/TimeoutStartSec=1/' \
    /etc/systemd/system/network-online.target.wants/networking.service

# Change to US keyboard layout
sed -i -E 's/^XKBLAYOUT="gb"$/XKBLAYOUT="us" # Comment stops change on upgrade/' /etc/default/keyboard

# Set the default locale to en_US
grep '^en_US.UTF-8 UTF-8' /etc/locale.gen >/dev/null
if [ $? -ne 0 ]; then
    perl -pi -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/g' /etc/locale.gen
    locale-gen en_US.UTF-8
    update-locale en_US.UTF-8
fi

localectl set-locale LC_TIME=en_US.UTF-8

# Setup USB stick automount
diff ./installer/config/11-automount.rules /etc/udev/rules.d/11-automount.rules >/dev/null
if [ $? -ne 0 ]; then
  cp ./installer/config/11-automount.rules /etc/udev/rules.d/
  sed -i -E 's/^(MountFlags=slave)/#\1/' \
      /lib/systemd/system/systemd-udevd.service
  REBOOT=true
fi

# Disable disk-based swap
if [ -e /etc/dphys-swapfile ]; then
    apt-get purge -y dphys-swapfile
    rm -f /var/swap
fi

# Enable zram swap
# See https://github.com/ecdye/zram-config
# The zram-config-main.zip is a downloaded snapshot of the git repository
if [ ! -e /usr/local/sbin/zram-config ]; then
    modprobe -a lz4 zram

    unzip ./installer/linux-packages/zram-config-main.zip -d /tmp
    /tmp/zram-config-main/install.bash

    sed -i -E 's/^(swap\s+)(lzo-rle)(.*)$/\1lz4\3/' /etc/ztab
    sed -i -E 's/^(swap.*)150\s*$/\1100/' /etc/ztab
    sed -i -E 's/^(log.*)$/#\1/' /etc/ztab

    sed -i -E 's/^Type=exec$/Type=simple/' /etc/systemd/system/zram-config.service

    systemctl restart zram-config

    rm -rf /tmp/zram-config
fi

# Install .Xresources & .xinitrc
cp ./installer/config/Xresources ~pi/.Xresources
chown pi:pi ~pi/.Xresources
cp ./installer/config/xinitrc ~pi/.xinitrc
chmod +x ~pi/.xinitrc
chown pi:pi ~pi/.xinitrc

# Configure the "ratpoison" window manager
if [ ! -e ~pi/.ratpoisonrc ]; then
    cp ./installer/config/ratpoisonrc ~pi/.ratpoisonrc
    chmod 644 ~pi/.ratpoisonrc
    chown pi:pi ~pi/.ratpoisonrc
fi

# Configure the Plymouth graphical bootloader with the Onefinity theme
rm -rf /usr/share/plymouth/themes/buildbotics
rm -rf /usr/share/plymouth/themes/onefinity
mkdir -p /usr/share/plymouth/themes/onefinity/
cp -av ./installer/splash/* /usr/share/plymouth/themes/onefinity/
plymouth-set-default-theme -R onefinity

grep 'quiet splash plymouth.ignore-serial-consoles logo.nologo' /boot/cmdline.txt >/dev/null
if [ $? -ne 0 ]; then
    echo -n " quiet splash plymouth.ignore-serial-consoles logo.nologo" >> /boot/cmdline.txt
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
cp ./installer/config/rc.local /etc/

# Install bbctrl
if $UPDATE_PY; then
    systemctl stop bbctrl

    rm -rf /usr/local/lib/python*/dist-packages/bbctrl-*

    # Ensure python dependencies are installed
    pip3 install --no-index --find-links installer/python-packages -r requirements.txt

    ./setup.py install --force

    HTTP_DIR=$(find /usr/local/lib/ -type d -name "http")
    chmod 777 $HTTP_DIR

    systemctl restart bbctrl
fi

# Install the service that turns off the screen during shutdown
remove_services bbctrl-poweroff onefinity-poweroff
cp ./installer/config/onefinity-poweroff.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable onefinity-poweroff

# Expand the file system if necessary
chmod +x ./installer/scripts/resize_root_fs.sh
./installer/scripts/resize_root_fs.sh
if [ $? -eq 0 ]; then
    REBOOT=true
fi

# Install our logrotate config
rm -f /etc/logrotate.d/{bbctrl,onefinity}
cp ./installer/config/onefinity-logrotate /etc/logrotate.d/onefinity
chown root:root /etc/logrotate.d/onefinity

# Ensure logrotate runs on every boot (for systems with no network, thus bad clock)
if [ ! -e /etc/cron.d/reboot ]; then
    cp ./installer/config/cron_d_reboot /etc/cron.d/reboot
    mkdir -p /etc/cron.reboot
    cp ./installer/config/cron_reboot_logrotate /etc/cron.reboot/logrotate
fi

# Delete some cookies that were left behind in older images
chmod +x ./installer/scripts/delete-cookies.py
./installer/scripts/delete-cookies.py
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
