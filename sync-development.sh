#!/usr/bin/env bash

# I both develop and use sysdef. This script allwos me to copy the files from the sysdef development that I keep in
# /home/firesquid/source/sysdef into this
#

cd "$(dirname "$0")" || exit


rm -r ./sysdef-src
cp -r "$HOME/source/sysdef/package/sysdef-src" ./
