# Shared standalone-Linux desktop profile. Hosts supply only their settings
# and GPU bridge; both workstations use this exact application/tool inventory.
{
  pkgs,
  applications,
  ags,
  graphics,
  host,
}:
let
  inherit (graphics) gl vulkan;
  desktopPackages = import ./workstation-packages.nix {
    inherit pkgs ags graphics;
    personalPackages = applications;
  };
  session = pkgs.writeShellScriptBin "start-nix-hyprland" ''
    ${graphics.check}
    export SYSTEM_CONFIG_DIR=${pkgs.lib.escapeShellArg host.checkout}
    export SCRIPTS_DIR="$SYSTEM_CONFIG_DIR/scripts"
    export PATH="$HOME/.nix-profile/bin:$PATH"
    export XDG_DATA_DIRS="$HOME/.nix-profile/share:''${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
    exec ${pkgs.hyprland}/bin/start-hyprland --no-nixgl --path ${graphics.wrap pkgs.hyprland}/bin/Hyprland -- --config "$SYSTEM_CONFIG_DIR/dotfiles/hypr/hyprland.lua" "$@"
  '';
  hermes = pkgs.writeShellScript "workstation-hermes" ''
    if [[ ''${1:-} == desktop ]]; then
      ${graphics.environment}
      shift
      exec ${gl} ${applications.hermes}/bin/hermes-desktop --class=com.nousresearch.hermes --use-angle=gl --disable-features=Vulkan "$@"
    fi
    exec ${applications.hermes}/bin/hermes "$@"
  '';
  desktop = pkgs.writeShellScript "workstation-hermes-desktop" ''
    ${graphics.environment}
    exec ${gl} ${applications.hermes}/bin/hermes-desktop --class=com.nousresearch.hermes --use-angle=gl --disable-features=Vulkan "$@"
  '';
  herdr = pkgs.writeShellScript "workstation-herdr-app" ''
    exec ${vulkan} ${applications.herdr-desktop}/bin/herdr-app "$@"
  '';
in
pkgs.symlinkJoin {
  name = "personal-workstation";
  paths = [
    applications.hermes
    applications.herdr-core
    applications.herdr-desktop
    session
  ]
  ++ desktopPackages.packages;
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
    cat > "$out/share/applications/steam.desktop" <<EOF
    [Desktop Entry]
    Type=Application
    Name=Steam
    Exec=$out/bin/steam %U
    Icon=steam
    Terminal=false
    Categories=Game;
    MimeType=x-scheme-handler/steam;x-scheme-handler/steamlink;
    EOF
    mkdir -p "$out/share/nix-desktop" "$out/share/wayland-sessions"
    cat > "$out/share/nix-desktop/native-graphics.conf" <<'EOF'
    [Service]
    # Native portals must not inherit compositor-scoped Nix GPU overrides.
    UnsetEnvironment=LD_LIBRARY_PATH LD_PRELOAD __EGL_VENDOR_LIBRARY_FILENAMES GBM_BACKENDS_PATH GBM_BACKEND LIBGL_DRIVERS_PATH VK_DRIVER_FILES VK_ICD_FILENAMES VK_LAYER_PATH
    EOF
    cat > "$out/share/wayland-sessions/hyprland-nix.desktop" <<'EOF'
    [Desktop Entry]
    Name=Hyprland (Nix)
    Comment=Nix desktop; native login remains available as fallback
    Exec=${host.homeDirectory}/.nix-profile/bin/start-nix-hyprland
    Type=Application
    DesktopNames=Hyprland
    EOF
  '';
  passthru = {
    inherit applications;
    runtime = {
      ags = graphics.wrap ags;
      hyprland = graphics.wrap pkgs.hyprland;
    };
    graphicsConfigured = graphics.configured;
    graphicsBackend = graphics.backend;
    nvidiaVersion = graphics.version;
    managedPackages = map (package: package.pname or package.name) (
      desktopPackages.gui ++ desktopPackages.tools ++ [ ags ]
    );
  };
}
