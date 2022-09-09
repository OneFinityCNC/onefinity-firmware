#!/bin/bash -ex

IMG_DATE=2017-11-29
IMG_BASE=${IMG_DATE}-raspbian-stretch-lite
BASE_URL=https://downloads.raspberrypi.org/raspbian_lite/images
IMG_URL=$BASE_URL/raspbian_lite-2017-12-01/$IMG_BASE.zip
GPLAN_IMG=gplan-dev.img

# Create dev image
if [ ! -e $GPLAN_IMG ]; then

    # Get base image
    if [ ! -e $IMG_BASE.img ]; then
        if [ ! -e $IMG_BASE.zip ]; then
            wget $IMG_URL
        fi

        unzip $IMG_BASE.zip
    fi

    # Copy base image
    cp $IMG_BASE.img $GPLAN_IMG.tmp

    # Init image
    mkdir -p rpi-share
    cp ./scripts/gplan-init-dev-img.sh rpi-share
    chmod +x ./rpi-share/gplan-init-dev-img.sh
    sudo ./scripts/rpi-chroot.sh $GPLAN_IMG.tmp /mnt/host/gplan-init-dev-img.sh

    # Move image
    mv $GPLAN_IMG.tmp $GPLAN_IMG
fi

mkdir -p rpi-share || true

if [ ! -e rpi-share/cbang ]; then
    mkdir -p rpi-share/cbang
    git -C rpi-share/cbang init
    git -C rpi-share/cbang remote add origin https://github.com/CauldronDevelopmentLLC/cbang
	git -C rpi-share/cbang fetch --depth 1 origin 18f1e963107ef26abe750c023355a5c40dd07853
    git -C rpi-share/cbang reset --hard FETCH_HEAD
fi

if [ ! -e rpi-share/camotics ]; then
    mkdir -p rpi-share/camotics
    git -C rpi-share/camotics init
    git -C rpi-share/camotics remote add origin https://github.com/CauldronDevelopmentLLC/camotics
	git -C rpi-share/camotics fetch --depth 1 origin ec876c80d20fc19837133087cef0c447df5a939d
    git -C rpi-share/camotics reset --hard FETCH_HEAD
fi
