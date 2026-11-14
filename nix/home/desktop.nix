{
  config,
  lib,
  pkgs,
  ...
}:
{
  gtk = {
    enable = true;
    theme = {
      name = "Tokyonight-Dark";
      package = pkgs.tokyonight-gtk-theme;
    };
    iconTheme = {
      name = "Qogir-dark";
      package = pkgs.qogir-icon-theme;
    };
    font = {
      name = "Noto Sans";
      size = 10;
    };
    gtk4.theme = config.gtk.theme;
    gtk3.extraConfig = {
      gtk-enable-event-sounds = false;
      gtk-enable-input-feedback-sounds = false;
    };
  };
  home = {
    pointerCursor = {
      enable = true;
      name = "GoogleDot-Black";
      package = pkgs.google-cursor;
      size = 24;
      gtk.enable = true;
      x11.enable = true;
    };
    activation.desktopDirectories = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      run ${pkgs.coreutils}/bin/mkdir -p ${lib.escapeShellArg "${config.home.homeDirectory}/notes"} ${lib.escapeShellArg "${config.home.homeDirectory}/source"}
    '';
    # Desktop startup is owned by hyprland.lua and hypr-startup.sh, not HM services.
    sessionVariables = {
      QT_QPA_PLATFORMTHEME = "qt6ct";
      SYSTEM_CONFIG_DIR = config.personal.checkout;
    };
  };
  xdg = {
    userDirs = {
      enable = true;
      createDirectories = true;
      setSessionVariables = true;
    };
    configFile = {
      "qt6ct/qt6ct.conf".text = ''
        [Appearance]
        style=kvantum
        icon_theme=Qogir-dark
      '';
      "Kvantum/kvantum.kvconfig".text = ''
        [General]
        theme=Kvantum-Tokyo-Night
      '';
    };
  };
}
