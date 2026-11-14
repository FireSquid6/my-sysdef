# Shared desktop/app/tool inventory for kotoko AND deisslaptop.
# Host hardware, usernames and paths do not belong in this file.
{
  pkgs,
  ags,
  graphics,
  personalPackages,
}:
let
  gui =
    with pkgs;
    [
      hyprland
      hypridle
      hyprpaper
      hyprpicker
      hyprshot
      alacritty
      foot
      chromium
      firefox
      discord
      slack
      zoom-us
      zed-editor
      protonmail-desktop
      thunderbird
      obsidian
      spotify
      inkscape
      meld
      galculator
      file-roller
      godot
      libresprite
      prismlauncher
      tiled
      openrgb
      pavucontrol
      kdePackages.dolphin
      kdePackages.qt6ct
      networkmanagerapplet
      protonmail-bridge
    ]
    ++ [
      personalPackages.youtube-music-for-desktop
      personalPackages.openchamber-desktop
    ];
  tools = with pkgs; [
    bashInteractive
    fish
    gjs
    bun
    nodejs
    pnpm
    uv
    git
    gh
    pi-coding-agent
    claude-code
    opencode
    github-copilot-cli
    neovim
    vim
    nano
    starship
    tmux
    zellij
    direnv
    yazi
    lazygit
    lazydocker
    go
    rustc
    cargo
    zig
    jdk25
    maven
    jdt-language-server
    R
    gcc
    gnumake
    cmake
    meson
    ninja
    pkg-config
    bear
    cloc
    just
    typescript
    tailwindcss_4
    sassc
    tree-sitter
    typst
    ansible
    doctl
    opentofu
    valgrind
    shellcheck
    ripgrep
    fd
    fzf
    jq
    wget
    curl
    less
    which
    file
    tree
    gnutar
    gzip
    bzip2
    xz
    rsync
    zip
    unzip
    unrar
    _7zz
    htop
    duf
    inxi
    lsscsi
    pv
    smartmontools
    exiftool
    poppler
    libnotify
    brightnessctl
    pamixer
    wl-clipboard
    xdg-utils
    desktop-file-utils
    networkmanager
    tailscale
    openssh
    waypipe
    (docker_29.override { clientOnly = true; })
    docker-compose
    playerctl
    signal-cli
    vagrant
    spotify-player
    himalaya
    coreutils
    findutils
    gnugrep
    gnused
    gawk
    util-linux
    procps
    nerd-fonts.jetbrains-mono
    noto-fonts
    noto-fonts-color-emoji
    tokyonight-gtk-theme
    qogir-icon-theme
    google-cursor
    kdePackages.qtstyleplugin-kvantum
    personalPackages.kvantum-tokyo-night
    (python3.withPackages (
      ps: with ps; [
        defusedxml
        packaging
        pyqt6
      ]
    ))
    personalPackages.glances-cli
    personalPackages.s-nail
  ];
  # Stock Nix PAM cannot authenticate safely against Arch's module layout.
  # Keep the host's native, PAM-integrated locker until separately validated.
  nativeEnvironment = ''
    unset LD_LIBRARY_PATH LD_PRELOAD __EGL_VENDOR_LIBRARY_FILENAMES
    unset GBM_BACKENDS_PATH GBM_BACKEND LIBGL_DRIVERS_PATH
    unset VK_DRIVER_FILES VK_ICD_FILENAMES VK_LAYER_PATH
  '';
  lock = pkgs.writeShellScriptBin "hyprlock" ''
    ${nativeEnvironment}
    exec /usr/bin/hyprlock "$@"
  '';
  # Retain Steam's native 32-bit/FHS driver integration for now.
  steam = pkgs.writeShellScriptBin "steam" ''
    ${nativeEnvironment}
    exec /usr/bin/steam "$@"
  '';
in
{
  packages =
    tools
    ++ map graphics.wrap (gui ++ [ ags ])
    ++ [
      lock
      steam
    ];
  inherit gui tools;
}
