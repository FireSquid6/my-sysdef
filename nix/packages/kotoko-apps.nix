# Non-NixOS deployment for kotoko's verified RTX 5070 / NVIDIA 615.78.08.
# This packages userspace graphics only: it never installs a kernel module.
{
  pkgs,
  nixgl,
  applications,
}:
let
  version = "615.78.08";
  driverHash = "sha256-Pj9t3cLudnoIGFMAr3vjyyhuznZpjS3eNSRZl4LQf/4=";
  compatibleNixgl = pkgs.runCommand "nixgl-libs-only-compat" { } ''
    cp -r ${nixgl} "$out"
    chmod -R u+w "$out"
    # Compatibility with this nixpkgs pin: libsOnly no longer accepts kernel,
    # and the driver now installs an architecture-independent ICD filename.
    substituteInPlace "$out/nixGL.nix" \
      --replace-fail 'kernel = null;' "" \
      --replace-fail 'nvidia_icd.x86_64.json' 'nvidia_icd.json'
  '';
  graphics = import compatibleNixgl {
    inherit pkgs;
    nvidiaVersion = version;
    nvidiaHash = driverHash;
    enable32bits = false;
  };
  driver =
    (graphics.nvidiaPackages {
      inherit version;
      sha256 = driverHash;
    }).nvidiaLibsOnly;
  desktopEnvironment = ''
    export GBM_BACKENDS_PATH=${driver}/lib/gbm
    export GBM_BACKEND=nvidia-drm
  '';
  gl = "${graphics.nixGLNvidia}/bin/nixGLNvidia-${version}";
  vulkan = "${graphics.nixVulkanNvidia}/bin/nixVulkanNvidia-${version}";
  hermes = pkgs.writeShellScript "kotoko-hermes" ''
    if [[ ''${1:-} == desktop ]]; then
      ${desktopEnvironment}
      shift
      exec ${gl} ${applications.hermes}/bin/hermes-desktop --class=com.nousresearch.hermes --use-angle=gl --disable-features=Vulkan "$@"
    fi
    exec ${applications.hermes}/bin/hermes "$@"
  '';
  desktop = pkgs.writeShellScript "kotoko-hermes-desktop" ''
    ${desktopEnvironment}
    exec ${gl} ${applications.hermes}/bin/hermes-desktop --class=com.nousresearch.hermes --use-angle=gl --disable-features=Vulkan "$@"
  '';
  herdr = pkgs.writeShellScript "kotoko-herdr-app" ''
    exec ${vulkan} ${applications.herdr-desktop}/bin/herdr-app "$@"
  '';
in
pkgs.symlinkJoin {
  name = "kotoko-fork-applications";
  paths = [
    applications.hermes
    applications.herdr-core
    applications.herdr-desktop
  ];
  postBuild = ''
    rm "$out/bin/hermes" "$out/bin/hermes-desktop" "$out/bin/herdr-app"
    ln -s ${hermes} "$out/bin/hermes"
    ln -s ${desktop} "$out/bin/hermes-desktop"
    ln -s ${herdr} "$out/bin/herdr-app"
    for entry in com.nousresearch.hermes.desktop herdr-app.desktop; do
      cp --remove-destination "$out/share/applications/$entry" "$out/share/applications/$entry.new"
      rm "$out/share/applications/$entry"
      mv "$out/share/applications/$entry.new" "$out/share/applications/$entry"
    done
    substituteInPlace "$out/share/applications/com.nousresearch.hermes.desktop" \
      --replace-fail '${applications.hermes.desktop}/bin/hermes-desktop' "$out/bin/hermes-desktop" \
      --replace-fail 'StartupWMClass=com.nousresearch.hermes' 'StartupWMClass=hermes'
    substituteInPlace "$out/share/applications/herdr-app.desktop" \
      --replace-fail 'Exec=herdr-app' "Exec=$out/bin/herdr-app"
  '';
  passthru = {
    inherit applications;
    nvidiaVersion = version;
  };
}
