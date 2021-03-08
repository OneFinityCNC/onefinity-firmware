#!/bin/bash

# Used by the OneFinity firmware to determine if the root filesystem
# needs to be enlarged to maximize usage of the SD card.
#
# The majority of this code originates from /usr/lib/raspi-config/init_resize.sh

get_fs_resize_variables () {
    ROOT_PART_DEV=$(findmnt / -o source -n)
    ROOT_PART_NAME=$(echo "$ROOT_PART_DEV" | cut -d "/" -f 3)
    ROOT_DEV_NAME=$(echo /sys/block/*/"${ROOT_PART_NAME}" | cut -d "/" -f 4)
    ROOT_DEV="/dev/${ROOT_DEV_NAME}"
    ROOT_PART_NUM=$(cat "/sys/block/${ROOT_DEV_NAME}/${ROOT_PART_NAME}/partition")
    BOOT_PART_DEV=$(findmnt /boot -o source -n)
    BOOT_PART_NAME=$(echo "$BOOT_PART_DEV" | cut -d "/" -f 3)
    BOOT_DEV_NAME=$(echo /sys/block/*/"${BOOT_PART_NAME}" | cut -d "/" -f 4)
    ROOT_DEV_SIZE=$(cat "/sys/block/${ROOT_DEV_NAME}/size")
    TARGET_END=$((ROOT_DEV_SIZE - 1))
    PARTITION_TABLE=$(parted -m "$ROOT_DEV" unit s print | tr -d 's')
    LAST_PART_NUM=$(echo "$PARTITION_TABLE" | tail -n 1 | cut -d ":" -f 1)
    ROOT_PART_LINE=$(echo "$PARTITION_TABLE" | grep -e "^${ROOT_PART_NUM}:")
    ROOT_PART_END=$(echo "$ROOT_PART_LINE" | cut -d ":" -f 3)
}

should_resize_root_partition() {
    get_fs_resize_variables

    if [ "$BOOT_DEV_NAME" != "$ROOT_DEV_NAME" ]; then
        FAIL_REASON="Boot and root partitions are on different devices"
        return 1
    fi

    if [ "$ROOT_PART_NUM" -ne "$LAST_PART_NUM" ]; then
        FAIL_REASON="Root partition should be last partition"
        return 1
    fi

    if [ "$ROOT_PART_END" -gt "$TARGET_END" ]; then
        FAIL_REASON="Root partition runs past the end of device"
        echo $FAIL_REASON
        return 1
    fi

    if [ ! -b "$ROOT_DEV" ] || [ ! -b "$ROOT_PART_DEV" ] || [ ! -b "$BOOT_PART_DEV" ] ; then
        FAIL_REASON="Could not determine partitions"
        return 1
    fi

    if [ "$ROOT_PART_END" -eq "$TARGET_END" ]; then
        FAIL_REASON="Root partition is already expanded"
        return 1
    fi
}

if should_resize_root_partition; then
    grep "init_resize" /boot/cmdline.txt >/dev/null
    if [ $? -ne 0 ]; then
        # On the next boot, init_resize.sh will:
        #   Resize the root partition to use the rest of the SD card
        #   Remove itself from /boot/cmdline.txt
        #   Reboot the machine
        sudo mount /boot -o rw,remount
        sed -i 's/\(.*\)/\1 init=\/usr\/lib\/raspi-config\/init_resize.sh/' /boot/cmdline.txt
    fi

    # On the first boot after init_resize, resize2fs_once will:
    #   Resize the root fs to fill its partition
    #   Remove itself from the registered systemd services
    #   Delete itself from the filesystem
    #   Therefore, never run again
    cp scripts/resize2fs_once /etc/init.d/resize2fs_once
    chmod +x /etc/init.d/resize2fs_once
    systemctl enable resize2fs_once

    exit 0
else
    echo "Not resizing root partition: $FAIL_REASON"
    exit 1
fi
