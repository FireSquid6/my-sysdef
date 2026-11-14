{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.personal.modules;
  isX86Linux = pkgs.stdenv.hostPlatform.system == "x86_64-linux";
  group = description: { enable = lib.mkEnableOption description; };
in
{
  options.personal.modules = {
    applications = group "personal desktop applications";
    desktop = group "personal desktop user packages (not a system session)";
    development = group "personal development tools";
    systemUtilities = group "personal command-line system utilities";
    fonts = group "personal font packages";
    gamedev = group "personal game development tools";
    network = group "personal networking clients (not host services)";
    ags = group "AGS helper tools (AGS 3 runtime must be installed externally)";
    herdr = group "Herdr helper tools";
  };

  # Explicit attributes: missing/renamed packages must fail evaluation, not vanish.
  # See docs/nix-package-mapping.md for host-only and external-install exclusions.
  config = lib.mkMerge [
    (lib.mkIf cfg.applications.enable {
      home.packages =
        with pkgs;
        [
          chromium
          firefox
          spotify-player
          obsidian
          alacritty
          inkscape
        ]
        ++ lib.optionals isX86Linux [
          discord
          steam
          spotify
        ];
      warnings =
        lib.optional (!isX86Linux)
          "personal.modules.applications: Discord, Steam and Spotify desktop are x86_64-linux-only in nixos-25.11; use web/external alternatives on aarch64-linux (see docs/nix-package-mapping.md).";
    })

    (lib.mkIf cfg.desktop.enable {
      home.packages = with pkgs; [
        # The active Lua config requires host-managed Hyprland 0.57+.
        # Keep its matching ecosystem, portal and PAM locker native too.
        util-linux
        bun
        libnotify
        procps
        nerd-fonts.jetbrains-mono
      ];
      warnings = lib.optionals (!config.personal.nativeDesktopRuntime) [
        "personal.modules.desktop installs helper tools/fonts only: the active Lua config requires host-managed Hyprland 0.57+, matching Hyprland ecosystem/portal and native PAM locking; nixos-25.11 Hyprland 0.52.2 is incompatible (see docs/nix-package-mapping.md)."
      ];
    })

    (lib.mkIf cfg.development.enable {
      home.packages = with pkgs; [
        git
        gh
        go
        (python3.withPackages (
          ps: with ps; [
            defusedxml
            packaging
            pyqt6
          ]
        ))
        neovim
        vim
        meld
        cloc
        lazygit
        lazydocker
        nano
        nanorc
        perl
        nodejs
        (docker_29.override { clientOnly = true; })
        docker-compose
        jdk25
        maven
        tailwindcss_4
        typescript
      ];
    })

    (lib.mkIf cfg.systemUtilities.enable {
      home.packages = with pkgs; [
        htop
        wget
        tmux
        zellij
        fish
        starship
        less
        which
        bash-completion
        diffutils
        direnv
        unrar
        _7zz
        unzip
        xclip
        wmctrl
        hwinfo
        dmidecode
        ethtool
        hdparm
        sysfsutils
        usbutils
        usb-modeswitch
        ntp
        texinfo
        inetutils
        bind.dnsutils
        bind.host
        yazi
      ];
    })

    (lib.mkIf cfg.fonts.enable {
      home.packages = with pkgs; [
        nerd-fonts.jetbrains-mono
        liberation_ttf
        open-sans
        (if config.personal.nativeDesktopRuntime then ttf-bitstream-vera else ttf_bitstream_vera)
        noto-fonts
        noto-fonts-cjk-sans
        noto-fonts-cjk-serif
        noto-fonts-color-emoji
        cantarell-fonts
      ];
      fonts.fontconfig.enable = true;
    })

    (lib.mkIf cfg.gamedev.enable {
      home.packages = with pkgs; [
        godot
        libresprite
        prismlauncher
      ];
    })

    (lib.mkIf cfg.network.enable {
      home.packages = with pkgs; [
        tailscale
        openssh
        waypipe
      ];
    })

    (lib.mkIf cfg.ags.enable {
      # nixos-25.11 has AGS 2.3.0, but this repository imports AGS 3/Gnim.
      # Do NOT install pkgs.ags or try to assemble its GI runtime on PATH.
      home.packages = with pkgs; [
        nodejs
        bun
        libnotify
        pamixer
        networkmanager
        networkmanagerapplet
        pavucontrol
        tailscale
        util-linux
        coreutils
      ];
      warnings = lib.optionals (!config.personal.nativeDesktopRuntime) [
        "personal.modules.ags installs helper tools only: supply a compatible external AGS 3 + GTK4/Astal/Gnim runtime; nixos-25.11 pkgs.ags is incompatible AGS 2.3.0. No shell/service is started (see docs/nix-package-mapping.md)."
      ];
    })

    (lib.mkIf cfg.herdr.enable {
      home.packages = with pkgs; [
        bun
        libnotify
      ];
    })
  ];
}
