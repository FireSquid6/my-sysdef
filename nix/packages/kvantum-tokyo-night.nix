{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "kvantum-tokyo-night";
  version = "0-unstable-2024-08-08";
  src = fetchFromGitHub {
    owner = "0xsch1zo";
    repo = "Kvantum-Tokyo-Night";
    rev = "82d104e0047fa7d2b777d2d05c3f22722419b9ee";
    hash = "sha256-Uy/WthoQrDnEtrECe35oHCmszhWg38fmDP8fdoXQgTk=";
  };
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/Kvantum
    cp -r Kvantum-Tokyo-Night $out/share/Kvantum/
    runHook postInstall
  '';
  meta = {
    description = "Tokyo Night theme for the Kvantum Qt style engine";
    homepage = "https://github.com/0xsch1zo/Kvantum-Tokyo-Night";
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.linux;
  };
}
