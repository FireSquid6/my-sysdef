{
  lib,
  appimageTools,
  fetchurl,
}:
{
  pname,
  version,
  url,
  hash,
  mainProgram ? pname,
  desktopFile,
  iconFile,
  iconExtension ? "png",
  description,
  homepage,
  license,
  extraPkgs ? _: [ ],
}:
let
  src = fetchurl { inherit url hash; };
  contents = appimageTools.extract { inherit pname version src; };
in
appimageTools.wrapType2 {
  inherit
    pname
    version
    src
    extraPkgs
    ;

  extraInstallCommands = ''
    ${lib.optionalString (pname != mainProgram) ''
      mv "$out/bin/${pname}" "$out/bin/${mainProgram}"
    ''}
    install -Dm644 ${lib.escapeShellArg "${contents}/${desktopFile}"} \
      "$out/share/applications/${pname}.desktop"
    substituteInPlace "$out/share/applications/${pname}.desktop" \
      --replace-fail 'Exec=AppRun' "Exec=$out/bin/${mainProgram}" \
      --replace-fail 'Icon=${lib.removeSuffix ".${iconExtension}" iconFile}' 'Icon=${pname}'
    # The upstream PNG/SVG is a symlink into its hicolor tree; install dereferences it.
    install -Dm644 ${lib.escapeShellArg "${contents}/${iconFile}"} \
      "$out/share/icons/hicolor/${
        if iconExtension == "svg" then "scalable" else "512x512"
      }/apps/${pname}.${iconExtension}"
    ${lib.optionalString (pname == "youtube-music-for-desktop") ''
      substituteInPlace "$out/share/applications/${pname}.desktop" \
        --replace-fail 'Categories=Music;' 'Categories=AudioVideo;Audio;Music;'
    ''}
  '';

  meta = {
    inherit
      description
      homepage
      license
      mainProgram
      ;
    platforms = [ "x86_64-linux" ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
