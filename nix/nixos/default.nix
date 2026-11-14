{
  config,
  lib,
  pkgs,
  ...
}:
{
  imports = [
    ./desktop.nix
    ./services.nix
    ./development.nix
  ];

  options.personal.system = {
    username = lib.mkOption {
      type = lib.types.str;
      default = "firesquid";
      description = "Desktop account; set its password explicitly during installation.";
    };
    checkout = lib.mkOption {
      type = lib.types.str;
      default = "/home/${config.personal.system.username}/my-sysdef";
      description = "Persistent editable checkout containing the desktop configuration.";
    };
  };

  config = {
    nix.settings.experimental-features = [
      "nix-command"
      "flakes"
    ];
    nixpkgs.config.allowUnfree = true;
    time.timeZone = lib.mkDefault "America/Chicago";
    i18n.defaultLocale = lib.mkDefault "en_US.UTF-8";
    console.keyMap = "us";
    programs.fish.enable = true;
    users.users.${config.personal.system.username} = {
      isNormalUser = true;
      extraGroups = [
        "wheel"
        "networkmanager"
        "docker"
      ];
      shell = pkgs.fish;
      # No default password, password hash, SSH key, or autologin.
    };
    environment.systemPackages = with pkgs; [
      git
      vim
      wget
      curl
      file
      pciutils
      usbutils
      lsof
      psmisc
      man-pages
      man-pages-posix
      btrfs-progs
      e2fsprogs
      dosfstools
      exfatprogs
      f2fs-tools
      jfsutils
      nilfs-utils
      ntfs3g
      xfsprogs
      cryptsetup
      lvm2
      mdadm
      efibootmgr
      efitools
      mtools
      nfs-utils
    ];
    documentation.dev.enable = true;
    services.fstrim.enable = true;
  };
}
