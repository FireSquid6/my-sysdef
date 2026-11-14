# Standalone Linux GPU integration. Hardware selection lives in nix/hosts.nix,
# never in shared application lists or build-machine hardware detection.
{
  pkgs,
  nixgl,
  settings,
}:
let
  configured = settings != null;
  backend = if configured then settings.backend else "unconfigured";
  nvidia = backend == "nvidia";
  version = if nvidia then settings.version else null;
  compatibleNixgl = pkgs.runCommand "nixgl-libs-only-compat" { } ''
    cp -r ${nixgl} "$out"
    chmod -R u+w "$out"
    substituteInPlace "$out/nixGL.nix" \
      --replace-fail 'kernel = null;' "" \
      --replace-fail 'nvidia_icd.x86_64.json' 'nvidia_icd.json'
  '';
  graphics = import compatibleNixgl {
    inherit pkgs;
    nvidiaVersion = version;
    nvidiaHash = if nvidia then settings.driverHash else null;
    enable32bits = false;
  };
  driver =
    if nvidia then
      (graphics.nvidiaPackages {
        inherit version;
        sha256 = settings.driverHash;
      }).nvidiaLibsOnly
    else
      null;
  unconfigured = pkgs.writeShellScript "unconfigured-desktop-graphics" ''
    echo 'Configure this host GPU in nix/hosts.nix before launching the Nix desktop/apps. No hardware has been inferred.' >&2
    exit 1
  '';
  gl =
    if nvidia then
      "${graphics.nixGLNvidia}/bin/nixGLNvidia-${version}"
    else if backend == "mesa" then
      "${graphics.nixGLIntel}/bin/nixGLIntel"
    else
      "${unconfigured}";
  vulkan =
    if nvidia then
      "${graphics.nixVulkanNvidia}/bin/nixVulkanNvidia-${version}"
    else if backend == "mesa" then
      "${graphics.nixVulkanIntel}/bin/nixVulkanIntel"
    else
      "${unconfigured}";
  environment = pkgs.lib.optionalString nvidia ''
    export GBM_BACKENDS_PATH=${driver}/lib/gbm
    export GBM_BACKEND=nvidia-drm
  '';
  check =
    if !configured then
      ''
        exec ${unconfigured}
      ''
    else
      pkgs.lib.optionalString nvidia ''
        if ! ${pkgs.gnugrep}/bin/grep -Eq '(^|[[:space:]])${pkgs.lib.escapeRegex version}([[:space:]]|$)' /proc/driver/nvidia/version; then
          echo 'NVIDIA kernel/userspace mismatch: review this host GPU version/hash in nix/hosts.nix; native binaries remain available for recovery.' >&2
          exit 1
        fi
      '';
  wrap =
    package:
    pkgs.symlinkJoin {
      name = "${package.pname or package.name}-nix-graphics";
      paths = [ package ];
      nativeBuildInputs = [
        pkgs.makeWrapper
        pkgs.lndir
      ];
      postBuild = ''
        # Some packages link whole directories into another immutable output.
        # Detach only the ancestors we modify, keeping their contents linked.
        for directory in bin share share/applications; do
          if [[ -L "$out/$directory" ]]; then
            source=$(readlink -f "$out/$directory")
            rm "$out/$directory"
            mkdir -p "$out/$directory"
            lndir -silent "$source" "$out/$directory"
          fi
        done
        for executable in "$out"/bin/*; do
          [[ -f "$executable" && -x "$executable" ]] || continue
          case "$(basename "$executable")" in hyprctl|hyprpm|hypridle) continue ;; esac
          original=$(readlink -f "$executable")
          rm "$executable"
          makeWrapper ${gl} "$executable" \
            --add-flags ${vulkan} --add-flags "$original" \
            ${pkgs.lib.optionalString nvidia "--set GBM_BACKENDS_PATH ${driver}/lib/gbm --set GBM_BACKEND nvidia-drm"}
        done
        if [[ -d "$out/share/applications" ]]; then
          for entry in "$out"/share/applications/*.desktop; do
            [[ -f "$entry" ]] || continue
            cp --remove-destination "$entry" "$entry.new"
            mv "$entry.new" "$entry"
            substituteInPlace "$entry" --replace-quiet '${package}/bin/' "$out/bin/"
          done
        fi
      '';
      # The wrapper has one output; do not advertise the source's man/dev outputs.
      meta = package.meta // {
        outputsToInstall = [ "out" ];
      };
    };
in
assert pkgs.lib.assertMsg (builtins.elem backend [
  "nvidia"
  "mesa"
  "unconfigured"
]) "Unsupported GPU backend: ${backend}";
{
  inherit
    configured
    backend
    version
    gl
    vulkan
    environment
    check
    wrap
    ;
}
