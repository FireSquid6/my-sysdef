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
        printf '#!/bin/sh\nprintf "%%s\\n" "$__EGL_EXTERNAL_PLATFORM_CONFIG_DIRS"\n' > "$out/bin/graphics-fixture"
        chmod +x "$out/bin/graphics-fixture"
        ln -s ${share}/share "$out/share"
      '';
  graphics = import ../graphics {
    inherit pkgs nixgl;
    settings = null;
  };
  wrapped = graphics.wrap fixture;
  nvidiaGraphics = import ../graphics {
    inherit pkgs nixgl;
    settings = (import ../hosts.nix)."firesquid@kotoko".graphics;
  };
  nvidiaWrapped = nvidiaGraphics.wrap fixture;
  eglPlatforms = "${pkgs.egl-wayland}/share/egl/egl_external_platform.d";
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
  # A Wayland EGL client needs this bridge registry, not just libEGL_nvidia.
  test "$(${nvidiaWrapped}/bin/graphics-fixture)" = '${eglPlatforms}'
  test -f '${eglPlatforms}/10_nvidia_wayland.json'
  grep -F '__EGL_EXTERNAL_PLATFORM_CONFIG_DIRS=${eglPlatforms}' <<'EOF'
  ${nvidiaGraphics.environment}
  EOF
  touch "$out"
''
