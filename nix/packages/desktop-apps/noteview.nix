{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  makeWrapper,
  chromium,
}:
stdenv.mkDerivation {
  pname = "noteview";
  version = "2.1.1";
  src = fetchurl {
    # Upstream release assets still use the spelling "notesview".
    url = "https://github.com/FireSquid6/noteview/releases/download/v2.1.1/notesview-linux-x64";
    hash = "sha256-6jxIBYwWMEwu3Lw72XVDU/TofOMcgrGoLZNnGhJQbq8=";
  };
  dontUnpack = true;
  nativeBuildInputs = [
    autoPatchelfHook
    makeWrapper
  ];
  buildInputs = [ stdenv.cc.libc ];
  dontStrip = true; # Preserve the embedded Bun program payload.
  installPhase = ''
    runHook preInstall
    install -Dm755 "$src" "$out/bin/noteview"
    wrapProgram "$out/bin/noteview" \
      --set-default PUPPETEER_EXECUTABLE_PATH "${chromium}/bin/chromium"
    runHook postInstall
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/noteview-check-home"
    mkdir -p "$HOME"
    "$out/bin/noteview" --help | grep -F 'Usage: noteview'
    "$out/bin/noteview" serve --help | grep -F -- '--directory'
    runHook postInstallCheck
  '';
  meta = {
    description = "Local Markdown notebook viewer and static site exporter";
    homepage = "https://github.com/FireSquid6/noteview";
    license = lib.licenses.mit;
    mainProgram = "noteview";
    platforms = [ "x86_64-linux" ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
