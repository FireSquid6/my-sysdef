# Reproduce packages like Discord whose share AND applications dirs are links.
{ pkgs, nixgl }:
let
  desktop = pkgs.makeDesktopItem {
    name = "graphics-fixture";
    desktopName = "Graphics fixture";
    exec = "graphics-fixture";
  };
  share = pkgs.runCommand "graphics-fixture-share" { } ''
    mkdir -p "$out/share"
    ln -s ${desktop}/share/applications "$out/share/applications"
  '';
  fixture =
    pkgs.runCommand "graphics-fixture"
      {
        outputs = [
          "out"
          "man"
        ];
        meta = {
          mainProgram = "graphics-fixture";
          outputsToInstall = [
            "out"
            "man"
          ];
        };
      }
      ''
        mkdir -p "$out/bin" "$man/share/man"
        printf '#!/bin/sh\nexit 0\n' > "$out/bin/graphics-fixture"
        chmod +x "$out/bin/graphics-fixture"
        ln -s ${share}/share "$out/share"
      '';
  graphics = import ../graphics {
    inherit pkgs nixgl;
    settings = null;
  };
  wrapped = graphics.wrap fixture;
in
assert wrapped.meta.outputsToInstall == [ "out" ];
pkgs.runCommand "graphics-wrapper-contract" { } ''
  test -d ${wrapped}/share/applications
  test ! -L ${wrapped}/share
  test ! -L ${wrapped}/share/applications
  test -f ${wrapped}/share/applications/graphics-fixture.desktop
  # The unreviewed GPU path must fail explicitly, not try the build host driver.
  if ${wrapped}/bin/graphics-fixture > "$TMPDIR/output" 2>&1; then exit 1; fi
  grep -F 'Configure this host GPU' "$TMPDIR/output"
  touch "$out"
''
