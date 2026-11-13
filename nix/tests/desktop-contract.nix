{ pkgs, config }:
let
  inherit (pkgs) lib;
  home = config.home-manager.users.${config.personal.system.username};
  packages = config.environment.systemPackages ++ home.home.packages;
  names = map (p: p.pname or p.name) packages;
  required = [
    "hyprland"
    "hypridle"
    "hyprlock"
    "hyprpaper"
    "hyprpicker"
    "hyprshot"
    "xdg-desktop-portal-hyprland"
    "ags"
    "gjs"
    "sddm"
    "sysdef-sddm-tokyo-night"
    "dolphin"
    "thunderbird"
    "playerctl"
    "brightnessctl"
    "wl-clipboard"
    "herdr-core"
    "herdr-desktop"
    "hermes-0.23.1"
    "protonmail-desktop"
    "obsidian"
    "chromium"
    "firefox"
    "discord"
    "steam"
    "spotify"
    "spotify-player"
    "alacritty"
    "inkscape"
    "slack"
    "zoom"
    "libreoffice"
    "intellij-idea"
    "vscode"
    "postman"
    "github-copilot-cli"
    "opencode"
    "pi-coding-agent"
    "claude-code"
    "gradle"
    "jdt-language-server"
    "lldb"
    "pnpm"
    "uv"
    "bear"
    "boost"
    "sassc"
    "jq"
    "bubblewrap"
    "postgresql"
    "mariadb-server"
    "docker"
    "docker-compose"
    "godot"
    "libresprite"
    "prismlauncher"
    "pixelorama"
    "modrinth-app"
    "tetrio-desktop"
    "wayfarer"
    "obs-studio"
    "kooha"
    "kazam"
    "simplescreenrecorder"
    "wf-recorder"
    "file-roller"
    "galculator"
    "emdash-app"
    "youtube-music-for-desktop"
    "mdserve"
    "openchamber"
    "openchamber-desktop"
    "md-to-pdf"
    "browser-use-0.13.8"
    "tommy-excalidraw-cli"
    "glances-cli"
    "s-nail"
    "kvantum-tokyo-night"
    "tokyonight-gtk-theme"
    "google-cursor"
    "qogir-icon-theme"
    "rsync"
    "zip"
    "tealdeer"
  ];
  missing = lib.subtractLists names required;
  forbidden = lib.filter (
    name:
    lib.hasPrefix "xfce" name
    || lib.hasPrefix "xfwm" name
    || lib.hasPrefix "xfdesktop" name
    || lib.hasPrefix "lightdm" name
    || lib.hasPrefix "endeavouros" name
    || lib.hasPrefix "eos-" name
    || name == "trayscale"
  ) names;
  sessions = lib.concatMap (
    p: p.providedSessions or [ ]
  ) config.services.displayManager.sessionPackages;
in
assert lib.assertMsg (
  missing == [ ]
) "Missing desktop packages: ${lib.concatStringsSep ", " missing}";
assert lib.assertMsg (
  forbidden == [ ]
) "Excluded desktop packages present: ${lib.concatStringsSep ", " forbidden}";
assert config.programs.hyprland.enable;
assert config.programs.hyprlock.enable;
assert config.services.displayManager.sddm.enable;
assert config.services.displayManager.defaultSession == "sysdef-hyprland";
assert builtins.elem "sysdef-hyprland" sessions;
assert !(builtins.elem "xfce" sessions);
assert config.services.pipewire.enable && config.services.pipewire.wireplumber.enable;
assert config.networking.networkmanager.enable && config.networking.firewall.enable;
assert config.services.tailscale.enable && config.virtualisation.docker.enable;
assert config.hardware.graphics.enable && config.hardware.bluetooth.enable;
assert home.personal.nativeDesktopRuntime && home.personal.modules.gamedev.enable;
assert !home.personal.legacySessionFiles;
assert !home.targets.genericLinux.enable;
assert !(home.services.hypridle.enable or false);
assert !(builtins.hasAttr ".config/i3/config" home.personal.managedLinks);
assert home.personal.managedLinks.".config/hypr" == "dotfiles/hypr";
assert home.personal.managedLinks.".config/ags" == "ags";
pkgs.runCommand "desktop-contract" { } ''
  # Prove the actual packaged session selects Lua, rather than the legacy conf.
  session=${
    lib.head (
      lib.filter (
        p: builtins.elem "sysdef-hyprland" (p.providedSessions or [ ])
      ) config.services.displayManager.sessionPackages
    )
  }
  grep -F 'DesktopNames=Hyprland' "$session/share/wayland-sessions/sysdef-hyprland.desktop"
  launcher=$(sed -n 's/^Exec=//p' "$session/share/wayland-sessions/sysdef-hyprland.desktop")
  grep -F 'hyprland.lua' "$launcher"
  grep -F 'SYSTEM_CONFIG_DIR=' "$launcher"
  touch "$out"
''
