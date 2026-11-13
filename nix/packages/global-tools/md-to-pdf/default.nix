{ lib, buildNpmPackage, fetchurl, makeWrapper, chromium, runCommand, poppler-utils
, makeFontsConf, dejavu_fonts
}:

buildNpmPackage (finalAttrs: {
  pname = "md-to-pdf";
  version = "5.2.5";

  # The published source includes upstream's compiled TypeScript (dist/).
  src = fetchurl {
    url = "https://registry.npmjs.org/md-to-pdf/-/md-to-pdf-${finalAttrs.version}.tgz";
    hash = "sha256-80dlqvgf1bk2WXBPUM8Ve/WAlD2I/c5/7hyt1PMBbtE=";
  };

  npmDepsHash = "sha256-PDk1hStmjTaUR8R/GbR5521G3v22q5XGWcNCEVgIe1M=";
  nativeBuildInputs = [ makeWrapper ];

  # Production-only manifest: no build is needed for the published dist/.
  postPatch = ''
    cp ${./package.json} package.json
    cp ${./package-lock.json} package-lock.json
  '';
  dontNpmBuild = true;
  npmFlags = [ "--ignore-scripts" ];
  PUPPETEER_SKIP_DOWNLOAD = "true";

  postInstall = ''
    for program in md-to-pdf md2pdf; do
      wrapProgram "$out/bin/$program" \
        --set PUPPETEER_EXECUTABLE_PATH ${lib.getExe chromium} \
        --set PUPPETEER_SKIP_DOWNLOAD true
    done
  '';

  passthru.tests.render = runCommand "md-to-pdf-render-test" {
    nativeBuildInputs = [ finalAttrs.finalPackage poppler-utils ];
    FONTCONFIG_FILE = makeFontsConf { fontDirectories = [ dejavu_fonts ]; };
  } ''
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"
    md-to-pdf --version | grep -Fx '5.2.5'
    md2pdf --help >/dev/null
    printf '# Nix PDF smoke test\n\nOffline rendering works.\n' > input.md
    # Nix build sandboxes do not support Chromium's nested sandbox.
    md-to-pdf input.md --launch-options '{"args":["--no-sandbox"]}'
    pdftotext input.pdf output.txt
    grep -F 'Offline rendering works.' output.txt
    touch "$out"
  '';

  meta = {
    description = "CLI tool for converting Markdown files to PDF using Chromium";
    homepage = "https://github.com/simonhaenisch/md-to-pdf";
    license = lib.licenses.mit;
    mainProgram = "md-to-pdf";
    platforms = lib.platforms.linux;
  };
})
