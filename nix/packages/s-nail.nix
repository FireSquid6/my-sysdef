{
  lib,
  stdenv,
  fetchurl,
  openssl,
  libidn2,
  ncurses,
  pkg-config,
}:
stdenv.mkDerivation {
  pname = "s-nail";
  version = "14.9.25";
  src = fetchurl {
    url = "https://ftp.sdaoden.eu/s-nail-14.9.25.tar.xz";
    hash = "sha256-IP8FW+mCm2nUbrxADf5RakDSh9fOgQx0NV1r3Boo2Kk=";
  };
  nativeBuildInputs = [ pkg-config ];
  buildInputs = [
    openssl
    libidn2
    ncurses
  ];
  preConfigure = ''
    # S-nail warns on every invocation if Nix's /homeless-shelter does not exist;
    # those warnings also invalidate upstream's output-checksum tests.
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"
  '';
  configurePhase = ''
    runHook preConfigure
    make SHELL=${stdenv.shell} VAL_SHELL=${stdenv.shell} VAL_PREFIX="$out" OPT_DOTLOCK=no OPT_TLS=require config
    runHook postConfigure
  '';
  makeFlags = [
    "VAL_PREFIX=${builtins.placeholder "out"}"
    "VAL_SHELL=${stdenv.shell}"
    "OPT_DOTLOCK=no"
    "OPT_TLS=require"
  ];
  doCheck = true;
  checkTarget = "test";
  enableParallelBuilding = true;
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    test -x "$out/bin/s-nail"
    "$out/bin/s-nail" -V | grep -F 'v14.9.25'
    runHook postInstallCheck
  '';
  meta = {
    description = "Mail processing system with a mailx-compatible command interface";
    homepage = "https://www.sdaoden.eu/code.html";
    license = lib.licenses.isc;
    mainProgram = "s-nail";
    platforms = lib.platforms.linux;
  };
}
