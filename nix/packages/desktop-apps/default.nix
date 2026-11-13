{ pkgs }:
{
  emdash-app = pkgs.callPackage ./emdash-app.nix { };
  youtube-music-for-desktop = pkgs.callPackage ./youtube-music-for-desktop.nix { };
  mdserve = pkgs.callPackage ./mdserve.nix { };
  openchamber = pkgs.callPackage ./openchamber.nix { };
  openchamber-desktop = pkgs.callPackage ./openchamber-desktop.nix { };
}
