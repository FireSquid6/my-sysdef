{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
}:
stdenv.mkDerivation {
  pname = "mdserve";
  version = "1.0.0";
  # The repository was renamed to noteview; this release still provides mdserve.
  src = fetchurl {
    url = "https://github.com/FireSquid6/noteview/releases/download/v1.0.0/mdserve-linux-x64";
    hash = "sha256-WSmbrM5HL127X43yqQq/kn7hjljSh57gW3mKdZgQw/E=";
  };
  dontUnpack = true;
  nativeBuildInputs = [ autoPatchelfHook ];
  # Inspected DT_NEEDED: libc, pthread, dl, m and the glibc dynamic loader only.
  buildInputs = [ stdenv.cc.libc ];
  dontStrip = true; # Preserve the embedded Bun program payload.
  installPhase = ''
    runHook preInstall
    install -Dm755 "$src" "$out/bin/mdserve"
    runHook postInstall
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/mdserve-check-home"
    mkdir -p "$HOME"
    timeout 15 "$out/bin/mdserve" --help | grep -F 'Serve a directory of markdown files'
    runHook postInstallCheck
  '';
  meta = {
    description = "FireSquid6's Markdown preview server (not jfernandez/mdserve)";
    homepage = "https://github.com/FireSquid6/noteview";
    license = lib.licenses.mit;
    mainProgram = "mdserve";
    platforms = [ "x86_64-linux" ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
