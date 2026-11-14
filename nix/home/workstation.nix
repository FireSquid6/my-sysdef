# The same home configuration on both workstations; no OS installation module.
{
  config,
  lib,
  workstationBundle,
  ...
}:
{
  imports = [
    ../profiles/workstation.nix
    ./desktop.nix
  ];
  personal = {
    desktopRuntimeProvided = true;
    legacySessionFiles = false;
    modules.gamedev.enable = true;
  };
  # Use the identical, GPU-wrapped inventory installed by the package-profile
  # deployment. Don't install duplicate unwrapped apps from legacy group lists.
  home.packages = lib.mkForce [
    workstationBundle
    config.programs.home-manager.package
  ];
  home.sessionPath = lib.mkBefore [ "${config.home.homeDirectory}/.nix-profile/bin" ];
  targets.genericLinux.enable = true;
  xdg.configFile =
    lib.genAttrs
      (map (name: "systemd/user/${name}.service.d/50-nix-graphics-boundary.conf") [
        "xdg-desktop-portal"
        "xdg-desktop-portal-hyprland"
        "xdg-desktop-portal-gtk"
      ])
      (_: {
        source = "${workstationBundle}/share/nix-desktop/native-graphics.conf";
      })
    // {
      "Kvantum/Kvantum-Tokyo-Night".source =
        "${workstationBundle.applications.kvantum-tokyo-night}/share/Kvantum/Kvantum-Tokyo-Night";
    };
}
