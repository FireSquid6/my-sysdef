{ lib, callPackage }:
(callPackage ./appimage-package.nix { }) {
  pname = "youtube-music-for-desktop";
  version = "0.17.13";
  url = "https://github.com/Venipa/ytmdesktop2/releases/download/v0.17.13/YouTube-Music-for-Desktop-0.17.13.AppImage";
  hash = "sha256-VsMLHe6BbiJ7Yneko4DbYRnZZV6Pvw99tg05p/KB/p0=";
  desktopFile = "youtube music for desktop.desktop";
  iconFile = "youtube music for desktop.png";
  description = "Venipa's YouTube Music desktop client with Last.fm support";
  homepage = "https://github.com/Venipa/ytmdesktop2";
  license = lib.licenses.cc0;
}
