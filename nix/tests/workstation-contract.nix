# Static deployment contract. No compositor, locker, GUI or service is started.
{ pkgs, bundle }:
pkgs.runCommand "workstation-contract"
  {
    nativeBuildInputs = [ pkgs.desktop-file-utils ];
  }
  ''
    for command in Hyprland hyprctl hypridle hyprlock ags gjs bun node pnpm uv \
      pi claude opencode nvim fish git python3 go rustc gcc \
      firefox chromium hermes herdr-app hc start-nix-hyprland; do
      test -x "${bundle}/bin/$command"
    done
    ${pkgs.bash}/bin/bash -n ${bundle}/bin/hyprlock
    ${pkgs.bash}/bin/bash -n ${bundle}/bin/start-nix-hyprland
    grep -F 'exec /usr/bin/hyprlock' ${bundle}/bin/hyprlock
    grep -F 'unset LD_LIBRARY_PATH LD_PRELOAD' ${bundle}/bin/hyprlock
    grep -F -- '--no-nixgl --path' ${bundle}/bin/start-nix-hyprland
    grep -F 'hyprland.lua' ${bundle}/bin/start-nix-hyprland
    grep -F 'UnsetEnvironment=LD_LIBRARY_PATH' ${bundle}/share/nix-desktop/native-graphics.conf
    # SDDM's de-facto session key is not part of the application desktop spec.
    # Check it explicitly and validate all other fields with desktop-file-utils.
    grep -Fx 'DesktopNames=Hyprland' ${bundle}/share/wayland-sessions/hyprland-nix.desktop
    grep -v '^DesktopNames=' ${bundle}/share/wayland-sessions/hyprland-nix.desktop > "$TMPDIR/hyprland-nix.desktop"
    desktop-file-validate "$TMPDIR/hyprland-nix.desktop"
    desktop-file-validate ${bundle}/share/applications/steam.desktop

    # Existing mutable installers must not shadow Nix in fresh shells.
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME/.nix-profile/bin" "$HOME/.opencode/bin"
    printf '#!/bin/sh\nexit 0\n' > "$HOME/.nix-profile/bin/opencode"
    cp "$HOME/.nix-profile/bin/opencode" "$HOME/.opencode/bin/opencode"
    chmod +x "$HOME"/{.nix-profile,.opencode}/bin/opencode
    export PATH="$HOME/.opencode/bin:$PATH"
    ${pkgs.bash}/bin/bash --noprofile --norc -c '
      # The builder exports errexit; a normal fresh shell does not.
      set +e
      source ${../../dotfiles/bashrc}
      test "$(command -v opencode)" = "$HOME/.nix-profile/bin/opencode"
    '
    ln -s ${../../dotfiles/bashrc} "$HOME/.bashrc"
    ${pkgs.bash}/bin/bash --noprofile --norc -c '
      set +e
      source ${../../dotfiles/profile}
      test "$(command -v opencode)" = "$HOME/.nix-profile/bin/opencode"
    '
    # Fish's core config registers the fish_add_path change handler; fake HOME
    # keeps user config/state isolated while retaining normal shell startup.
    ${pkgs.fish}/bin/fish --private -c '
      source ${../../dotfiles/config.fish}
      test (command -s opencode) = "$HOME/.nix-profile/bin/opencode"
    '
    touch "$out"
  ''
