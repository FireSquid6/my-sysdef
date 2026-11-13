{ pkgs, ... }:
{
  home.packages = with pkgs; [
    duf
    inxi
    lsscsi
    mesa-demos
    plocate
    pv
    rsync
    sg3_utils
    smartmontools
    tealdeer
    zip
    exiftool
    poppler
    libgsf
    libopenraw
    libwnck
    SDL2_mixer
    SDL_mixer
    xdpyinfo
    xinput
    xkill
    xrandr
  ];
}
