#!/usr/bin/env bash

# I both develop and use sysdef. This script allwos me to copy the files from the sysdef development that I keep in
# /home/firesquid/source/sysdef into this
#

cd "$(dirname "$0")" || exit
cd .. || exit

CONFIRMATION="y"

if ! git diff --quiet || ! git diff --cached --quiet; then
  read -r -p "Untracked git changes you might overwrite. You sure? (y/n): " CONFIRMATION
fi


if [[ "$CONFIRMATION" != "y" ]]; then
    echo "Exiting."
    exit 0
fi

rm -r ./sysdef-src
cp -r "$HOME/source/sysdef/package/sysdef-src" ./
