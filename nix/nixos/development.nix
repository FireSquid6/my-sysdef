{ pkgs, ... }:
{
  virtualisation.docker.enable = true;
  programs.steam = {
    enable = true;
    # Do not open extra inbound streaming/game-server ports by default.
    remotePlay.openFirewall = false;
    dedicatedServer.openFirewall = false;
  };
  programs.nix-ld.enable = true;
  # Databases were installed, not enabled, on the source machine. Client/server
  # binaries remain available without starting new database services or copying data.
  environment.systemPackages = with pkgs; [
    postgresql
    mariadb
  ];
}
