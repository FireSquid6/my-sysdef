{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  makeWrapper,
  alsa-lib,
  at-spi2-atk,
  at-spi2-core,
  atk,
  cairo,
  cups,
  dbus,
  expat,
  glib,
  gtk3,
  libgbm,
  libx11,
  libxcb,
  libxcomposite,
  libxdamage,
  libxext,
  libxfixes,
  libxkbcommon,
  libxrandr,
  nspr,
  nss,
  pango,
  systemd,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "terminal-browser";
  version = "0.16.2";

  src = fetchurl {
    url = "https://github.com/zenbu-labs/terminal-browser/releases/download/v${finalAttrs.version}/terminal-browser-linux-x64.tar.gz";
    hash = "sha256-BcluPKH9jH87uyTFI1JxNV/l8rNMz8IPa0c/HsXzuxc=";
  };

  nativeBuildInputs = [
    autoPatchelfHook
    makeWrapper
  ];
  buildInputs = [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    atk
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libgbm
    libx11
    libxcb
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxkbcommon
    libxrandr
    nspr
    nss
    pango
    stdenv.cc.cc.lib
    systemd
  ];
  runtimeDependencies = [ (lib.getLib systemd) ];

  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/terminal-browser" "$out/bin"
    cp -r . "$out/lib/terminal-browser/"
    makeWrapper "$out/lib/terminal-browser/bin/terminal-browser" "$out/bin/terminal-browser"
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    "$out/bin/terminal-browser" --version | grep -F '${finalAttrs.version}'
    "$out/bin/terminal-browser" --help > /dev/null
    runHook postInstallCheck
  '';

  meta = {
    description = "Chromium-based browser rendered inside your terminal";
    homepage = "https://terminal-browser.com/";
    license = lib.licenses.mit;
    platforms = [ "x86_64-linux" ];
    mainProgram = "terminal-browser";
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
