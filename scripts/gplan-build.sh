#!/bin/bash -ex

cd /mnt/host
scons -j 8 -C cbang disable_local="re2 libevent"
export CBANG_HOME="/mnt/host/cbang"
scons -j 8 -C camotics gplan.so with_gui=0 with_tpl=0
