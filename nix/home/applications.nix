{ pkgs, ... }:
{
  home.packages = with pkgs; [
    thunderbird
    protonmail-desktop
    slack
    zoom-us
    libreoffice
    aspell
    obs-studio
    kooha
    kazam
    simplescreenrecorder
    wf-recorder
    pixelorama
    modrinth-app
    tetrio-desktop
    wayfarer
    file-roller
    galculator
    pandoc
    texliveSmall
    # Keep alternative tools available, but never autostart a second shell/daemon.
    foot
    fuzzel
    rofi
    waybar
    dunst
    wofi
  ];
}
