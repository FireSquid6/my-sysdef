#!/usr/bin/env bash


DIRECTORY="$HOME/source/sysdef/package/sysdef-src"

cd "$(dirname "$0")" || exit
cd .. || exit

CONFIRMATION="y"

if ! git -C "$DIRECTORY" diff --quiet || ! git -C "$DIRECTORY" diff --cached --quiet; then
  read -r -p "Untracked git changes you might overwrite. You sure? (y/n): " CONFIRMATION
fi

if [[ "$CONFIRMATION" != "y" ]]; then
    echo "Exiting."
    exit 0
fi

rm -r "$DIRECTORY"
cp -r "./sysdef-src" "$HOME/source/sysdef/package"
