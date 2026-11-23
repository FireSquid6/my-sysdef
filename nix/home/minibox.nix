# Minimal, manually started X11 session; no display manager or host service changes.
{
  config,
  pkgs,
  nixgl,
  graphicsSettings,
  ...
}:
let
  graphics = import ../graphics {
    inherit pkgs nixgl;
    settings = graphicsSettings;
  };
  dwm = pkgs.dwm.override { conf = ../packages/dwm/config.h; };
  xorgConfig = pkgs.writeText "minibox-xorg.conf" ''
    Section "Files"
      ModulePath "${pkgs.xorg.xorgserver}/lib/xorg/modules"
      ModulePath "${pkgs.xorg.xf86inputlibinput}/lib/xorg/modules"
    EndSection
    Section "Device"
      Identifier "gpu"
      Driver "modesetting"
    EndSection
    Section "InputClass"
      Identifier "libinput"
      MatchDevicePath "/dev/input/event*"
      Driver "libinput"
    EndSection
  '';
  startDesktop = pkgs.writeShellApplication {
    name = "start-minibox-desktop";
    runtimeInputs = [
      pkgs.xorg.xinit
      pkgs.xorg.xauth
      pkgs.coreutils
      pkgs.util-linux
    ];
    text = ''
      console=$(tty || true)
      if [[ ! "$console" =~ ^/dev/tty([0-9]+)$ ]]; then
        echo 'Run start-minibox-desktop from a local Linux TTY, not SSH or a terminal window.' >&2
        exit 1
      fi
      exec ${graphics.gl} startx ${config.home.homeDirectory}/.xsession -- \
        ${pkgs.xorg.xorgserver}/bin/Xorg :0 "vt''${BASH_REMATCH[1]}" \
        -keeptty -nolisten tcp -config ${xorgConfig}
    '';
  };
in
{
  imports = [ ../profiles/core.nix ];
  home.packages = [
    dwm
    startDesktop
    pkgs.nerd-fonts.jetbrains-mono
  ];
  fonts.fontconfig.enable = true;
  programs.alacritty = {
    enable = true;
    package = graphics.wrap pkgs.alacritty;
    settings = (builtins.fromTOML (builtins.readFile ../../dotfiles/alacritty.toml)) // {
      font = {
        normal = {
          family = "JetBrainsMono Nerd Font";
          style = "Regular";
        };
        bold = {
          family = "JetBrainsMono Nerd Font";
          style = "Bold";
        };
        italic = {
          family = "JetBrainsMono Nerd Font";
          style = "Italic";
        };
        bold_italic = {
          family = "JetBrainsMono Nerd Font";
          style = "Bold Italic";
        };
        size = 10.0;
      };
    };
  };
  xsession = {
    enable = true;
    windowManager.command = "${dwm}/bin/dwm";
  };
}
