#!/bin/bash -ex

cd /mnt/host
scons -j 8 -C cbang disable_local="re2 libevent"
export CBANG_HOME="/mnt/host/cbang"

perl -i -0pe 's/case 610: setPathMode.*;/case 610: break;/gm' /mnt/host/camotics/src/gcode/ControllerImpl.cpp
perl -i -0pe 's/case 611: setPathMode.*;/case 611: break;/gm' /mnt/host/camotics/src/gcode/ControllerImpl.cpp
perl -i -0pe 's/case 640: {[^}]+}/case 640: break;/gm' /mnt/host/camotics/src/gcode/ControllerImpl.cpp

scons -j 8 -C camotics gplan.so with_gui=0 with_tpl=0
