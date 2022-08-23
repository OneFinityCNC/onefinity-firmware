#!/bin/bash -ex

ROOT="$PWD/rpi-root"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <image> <exec>"
    exit 1
fi

IMAGE="$1"
LOOP_BOOT=
LOOP_ROOT=
EXEC=

if [ $# -gt 1 ]; then
    shift
    EXEC="$@"
fi

# install dependecies
if [ ! -e /usr/bin/qemu-arm-static ]; then
    apt-get update
    apt-get install -y qemu qemu-user-static binfmt-support
fi

# Clean up on EXIT
function cleanup {
    umount "$ROOT"/{dev/pts,dev,sys,proc,boot,mnt/host,} 2>/dev/null || true
    losetup -d $LOOP_BOOT 2>/dev/null || true
    losetup -d $LOOP_ROOT 2>/dev/null || true
    rmdir "$ROOT" 2>/dev/null || true
}
trap cleanup EXIT

LOOP_BOOT=`losetup -f`
losetup -o 4194304 $LOOP_BOOT "$IMAGE"

LOOP_ROOT=`losetup -f`
losetup -o 48234496 $LOOP_ROOT "$IMAGE"

# check and fix filesystems
fsck -f $LOOP_BOOT
fsck -f $LOOP_ROOT

# make dir
mkdir -p "$ROOT"

# mount partition
mount -o rw $LOOP_ROOT -t ext4 "$ROOT"
mount -o rw $LOOP_BOOT "$ROOT/boot"

# mount binds
mount --bind /dev "$ROOT/dev/"
mount --bind /sys "$ROOT/sys/"
mount --bind /proc "$ROOT/proc/"
mount --bind /dev/pts "$ROOT/dev/pts"
if [ -e ./rpi-share ]; then
    mkdir -p "$ROOT/mnt/host"
    mount --bind ./rpi-share "$ROOT/mnt/host"
fi

# copy qemu binary
cp /usr/bin/qemu-arm-static "$ROOT/usr/bin/"

# chroot to raspbian
chroot "$ROOT" $EXEC
