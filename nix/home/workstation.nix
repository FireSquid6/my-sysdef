{
  lib,
  pkgs,
  packageSources,
  ...
}:
let
  personalPackages = import ../packages { inherit pkgs packageSources; };
in
{
  imports = [
    ../modules
    ../profiles/workstation.nix
    ./development.nix
    ./applications.nix
    ./utilities.nix
    ./desktop.nix
  ];
  personal = {
    nativeDesktopRuntime = true;
    legacySessionFiles = false;
    modules.gamedev.enable = true;
  };
  targets.genericLinux.enable = lib.mkForce false;
  home.packages = with personalPackages; [
    s-nail
    kvantum-tokyo-night
    glances-cli
    hermes
    herdr-core
    herdr-desktop
    md-to-pdf
    browser-use
    tommy-excalidraw-cli
    emdash-app
    youtube-music-for-desktop
    mdserve
    openchamber
    openchamber-desktop
  ];
  xdg.configFile."Kvantum/Kvantum-Tokyo-Night".source =
    "${personalPackages.kvantum-tokyo-night}/share/Kvantum/Kvantum-Tokyo-Night";
}
