#!@shell@
# Keep the existing Hyprland command, but never run upstream's mutable
# `hermes desktop` bootstrap (which can install/build into the user's home).
if [ "${1-}" = desktop ]; then
    shift
    exec @desktop@ "$@"
fi
exec @agent@ "$@"
