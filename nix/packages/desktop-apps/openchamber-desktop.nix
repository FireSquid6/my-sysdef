{ lib, callPackage }:
(callPackage ./appimage-package.nix { }) {
  pname = "openchamber-desktop";
  version = "2.0.3";
  url = "https://github.com/openchamber/openchamber/releases/download/v2.0.3/OpenChamber-2.0.3-linux-x86_64.AppImage";
  hash = "sha256-CjGebfATwexB3PrUhUu5jUSXZmdw3eM6D3zBDF8ZmW0=";
  desktopFile = "openchamber.desktop";
  iconFile = "openchamber.svg";
  iconExtension = "svg";
  description = "OpenChamber Electron desktop interface for OpenCode";
  homepage = "https://github.com/openchamber/openchamber";
  license = lib.licenses.mit;
  extraPkgs = pkgs: [
    pkgs.git
    pkgs.libsecret
    pkgs.libnotify
  ];
}
