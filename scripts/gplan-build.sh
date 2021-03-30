#!/bin/bash -ex

cd /mnt/host
scons -j 8 -C cbang disable_local="re2 libevent"
export CBANG_HOME="/mnt/host/cbang"

CAMOTICS_ROOT="/mnt/host/camotics"
CAMOTICS_PLAN="${CAMOTICS_ROOT}/src/gcode/plan"

mkdir -p ${CAMOTICS_ROOT}/build
touch ${CAMOTICS_ROOT}/build/version.txt

perl -i -0pe 's/(fabs\((config\.maxVel\[axis\]) \/ unit\[axis\]\));/std::min(\2, \1);/gm' ${CAMOTICS_PLAN}/LineCommand.cpp ${CAMOTICS_PLAN}/LinePlanner.cpp
perl -i -0pe 's/(fabs\((config\.maxJerk\[axis\]) \/ unit\[axis\]\));/std::min(\2, \1);/gm' ${CAMOTICS_PLAN}/LineCommand.cpp ${CAMOTICS_PLAN}/LinePlanner.cpp
perl -i -0pe 's/(fabs\((config\.maxAccel\[axis\]) \/ unit\[axis\]\));/std::min(\2, \1);/gm' ${CAMOTICS_PLAN}/LineCommand.cpp ${CAMOTICS_PLAN}/LinePlanner.cpp

scons -j 8 -C camotics gplan.so with_gui=0 with_tpl=0
