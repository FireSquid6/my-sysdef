{
  lib,
  buildNpmPackage,
  fetchurl,
  nodejs_22,
  pkg-config,
  cairo,
  pango,
  libjpeg,
  giflib,
  librsvg,
  runCommand,
  python3,
  makeWrapper,
  makeFontsConf,
  dejavu_fonts,
}:

buildNpmPackage (finalAttrs: {
  pname = "tommy-excalidraw-cli";
  version = "0.5.0";
  nodejs = nodejs_22;

  src = fetchurl {
    url = "https://registry.npmjs.org/@tommywalkie/excalidraw-cli/-/excalidraw-cli-${finalAttrs.version}.tgz";
    hash = "sha256-LtAwVIzXbwg454azuue/2JXFgiX8VwIAna7IvwUVUNY=";
  };
  npmDepsHash = "sha256-/ndFWS/2hap+zPKZUK1CD39o2406N6zuAm9vafXA/4s=";

  nativeBuildInputs = [
    pkg-config
    makeWrapper
  ];
  buildInputs = [
    cairo
    pango
    libjpeg
    giflib
    librsvg
  ];
  postPatch = ''
    cp ${./package.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';
  # Published lib/ is already compiled. Disable all lifecycle hooks, then build
  # only canvas from source against Nix libraries/Node headers, never prebuilds.
  dontNpmBuild = true;
  npmFlags = [ "--ignore-scripts" ];
  postConfigure = ''
    npm_config_build_from_source=true npm rebuild canvas --ignore-scripts=false
  '';

  postInstall = ''
    # node-gyp objects/configuration are build artifacts, not runtime modules.
    canvasBuild="$out/lib/node_modules/@tommywalkie/excalidraw-cli/node_modules/canvas/build"
    find "$canvasBuild" -mindepth 1 -maxdepth 1 ! -name Release -exec rm -rf {} +
    find "$canvasBuild/Release" -mindepth 1 -maxdepth 1 ! -name '*.node' -exec rm -rf {} +
    wrapProgram "$out/bin/excalidraw-cli" \
      --set-default FONTCONFIG_FILE ${makeFontsConf { fontDirectories = [ dejavu_fonts ]; }}
  '';

  passthru.tests.render =
    runCommand "tommy-excalidraw-cli-render-test"
      {
        nativeBuildInputs = [
          finalAttrs.finalPackage
          (python3.withPackages (ps: [ ps.pillow ]))
        ];
      }
      ''
        export HOME="$TMPDIR/home"
        mkdir -p "$HOME"
        excalidraw-cli --help > help.txt
        grep -F 'Parses Excalidraw JSON schemas into PNGs' help.txt
        excalidraw-cli --version | grep -F '@tommywalkie/excalidraw-cli/0.5.0'
        excalidraw-cli ${./sample.excalidraw} output.png --quiet
        python ${./check-png.py} output.png
        touch "$out"
      '';

  meta = {
    description = "Tommywalkie's Excalidraw JSON to PNG CLI (node-canvas renderer)";
    homepage = "https://github.com/tommywalkie/excalidraw-cli";
    license = lib.licenses.mit;
    mainProgram = "excalidraw-cli";
    platforms = lib.platforms.linux;
  };
})
