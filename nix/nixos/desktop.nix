{
  config,
  lib,
  pkgs,
  ...
}:
let
  session = pkgs.writeShellScript "sysdef-hyprland" ''
    export SYSTEM_CONFIG_DIR=${lib.escapeShellArg config.personal.system.checkout}
    export SCRIPTS_DIR="$SYSTEM_CONFIG_DIR/scripts"
    profile=/etc/profiles/per-user/${config.personal.system.username}
    if [[ -f "$profile/etc/profile.d/hm-session-vars.sh" ]]; then
      source "$profile/etc/profile.d/hm-session-vars.sh"
    fi
    exec ${pkgs.hyprland}/bin/start-hyprland -- -c "$HOME/.config/hypr/hyprland.lua"
  '';
  sessionPackage =
    pkgs.runCommand "sysdef-hyprland-session"
      {
        passthru.providedSessions = [ "sysdef-hyprland" ];
      }
      ''
        mkdir -p $out/share/wayland-sessions
        cat > $out/share/wayland-sessions/sysdef-hyprland.desktop <<EOF
        [Desktop Entry]
        Name=Hyprland (sysdef)
        Comment=Tokyo Night AGS desktop
        Exec=${session}
        Type=Application
        DesktopNames=Hyprland
        EOF
      '';
  # Reuse the maintained Qt6 theme runtime, with our exact tracked settings.
  loginTheme = pkgs.sddm-astronaut.overrideAttrs (old: {
    pname = "sysdef-sddm-tokyo-night";
    postInstall = (old.postInstall or "") + ''
      theme=$out/share/sddm/themes/sddm-astronaut-theme
      chmod u+w "$theme/metadata.desktop"
      cp ${../../dotfiles/sddm/theme.conf} "$theme/theme.conf"
      cp ${../../dotfiles/sddm/metadata.desktop} "$theme/metadata.desktop"
    '';
  });
in
{
  assertions = [
    {
      assertion = lib.versionAtLeast pkgs.hyprland.version "0.57";
      message = "The tracked hyprland.lua requires Hyprland 0.57 or newer.";
    }
  ];

  qt = {
    enable = true;
    style = "kvantum";
  };
  hardware.graphics = {
    enable = true;
    enable32Bit = pkgs.stdenv.hostPlatform.isx86_64;
  };
  programs = {
    hyprland = {
      enable = true;
      xwayland.enable = true;
      # NixOS supplies the matching portal, session and polkit integration.
    };
    hyprlock.enable = true;
    dconf.enable = true;
  };
  security = {
    pam.services.hyprlock = { };
    polkit.enable = true;
    rtkit.enable = true;
  };

  services = {
    displayManager = {
      defaultSession = "sysdef-hyprland";
      sessionPackages = [ sessionPackage ];
      sddm = {
        enable = true;
        wayland.enable = true;
        theme = "sddm-astronaut-theme";
        extraPackages = with pkgs.kdePackages; [
          qtsvg
          qtdeclarative
          qtmultimedia
          qtvirtualkeyboard
          qt5compat
        ];
        settings.General.InputMethod = "qtvirtualkeyboard";
      };
    };
    # The greeter and desktop are Wayland; XWayland remains available for old apps.
    xserver.xkb = {
      layout = "us";
      options = "caps:escape";
    };

    pipewire = {
      enable = true;
      alsa = {
        enable = true;
        support32Bit = true;
      };
      pulse.enable = true;
      wireplumber.enable = true;
    };
    libinput.enable = true;
    upower.enable = true;
    accounts-daemon.enable = true;
    power-profiles-daemon.enable = true;
    gvfs.enable = true;
    tumbler.enable = true;
    udisks2.enable = true;
    gnome.gnome-keyring.enable = true;
  };
  systemd.user.services.polkit-gnome-authentication-agent-1 = {
    description = "Graphical polkit authentication agent";
    wantedBy = [ "graphical-session.target" ];
    partOf = [ "graphical-session.target" ];
    serviceConfig = {
      ExecStart = "${pkgs.polkit_gnome}/libexec/polkit-gnome-authentication-agent-1";
      Restart = "on-failure";
    };
  };
  fonts.packages = with pkgs; [
    nerd-fonts.jetbrains-mono
    noto-fonts
  ];
  environment = {
    systemPackages = with pkgs; [
      loginTheme
      hypridle
      hyprpaper
      hyprpicker
      hyprshot
      gjs
      playerctl
      brightnessctl
      wl-clipboard
      kdePackages.dolphin
      kdePackages.qt6ct
      kdePackages.qtstyleplugin-kvantum
      polkit_gnome
      google-cursor
      qogir-icon-theme
      alsa-utils
      alsa-plugins
      pipewire.jack
      gst_all_1.gst-libav
      gst_all_1.gst-plugins-bad
      gst_all_1.gst-plugins-ugly
      ffmpegthumbnailer
      libdvdcss
    ];
    sessionVariables = {
      NIXOS_OZONE_WL = "1";
      QT_QPA_PLATFORMTHEME = "qt6ct";
    };
  };
  # hypr-startup.sh already owns hypridle, hyprpaper, AGS and nm-applet startup.
  # Do not enable parallel user services for these.
}
