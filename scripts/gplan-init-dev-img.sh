#!/bin/bash -e

export LC_ALL=C
cd /mnt/host

# Update the system
apt -o "Acquire::https::Verify-Peer=false" update
#apt-get dist-upgrade -y

# Install packages
apt -o "Acquire::https::Verify-Peer=false" install -y scons build-essential libssl-dev python3-dev
