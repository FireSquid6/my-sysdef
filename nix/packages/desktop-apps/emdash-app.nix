{ lib, callPackage }:
(callPackage ./appimage-package.nix { }) {
  pname = "emdash-app";
  version = "0.4.16";
  mainProgram = "emdash";
  url = "https://github.com/generalaction/emdash/releases/download/v0.4.16/emdash-x86_64.AppImage";
  hash = "sha256-MFuYEkcQ4jQ18GZT8bUjeS27TxB7zbsy0upo/lKLj8k=";
  desktopFile = "emdash.desktop";
  iconFile = "emdash.png";
  description = "Run multiple coding agents in parallel";
  homepage = "https://github.com/generalaction/emdash";
  license = lib.licenses.mit;
  extraPkgs = pkgs: [
    pkgs.git
    pkgs.libsecret
    pkgs.libnotify
  ];
}
