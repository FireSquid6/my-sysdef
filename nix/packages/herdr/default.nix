{ pkgs, packageSources }:
let
  # Reuse nixpkgs' native dependencies, desktop integration and sandbox patches.
  # Source and dependency hashes are pinned independently of nixpkgs releases.
  core = pkgs.herdr-core.overrideAttrs (old: {
    version = "0.1.20";
    src = packageSources.herdr-core;
    # The fork added foreground tests that generate executable Bash scripts.
    # patchShebangs cannot see those scripts until the test creates them.
    postPatch = old.postPatch + ''
      substituteInPlace crates/herdr-core/tests/foreground.rs \
        --replace-fail '#!/bin/bash' '#!${pkgs.bash}/bin/bash'
    '';
    # Like nixpkgs' two existing exclusions, this new remote-bootstrap test
    # expects to copy this ELF to another machine. Nix deliberately disables
    # that path because the remote may not have its /nix/store dependencies.
    checkFlags = (old.checkFlags or [ ]) ++ [
      "--skip=interactive_add_uses_the_same_ssh_target_for_login_and_install"
    ];
    cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
      pname = "herdr-core";
      version = "0.1.20";
      src = packageSources.herdr-core;
      hash = "sha256-v+0gGNHJX1tWTBBg4F5kUeu7QHHG9A+0ZagvpiIeQeE=";
    };
  });
  desktop = (pkgs.herdr-desktop.override { herdr-core = core; }).overrideAttrs (old: {
    version = "0.1.15";
    src = packageSources.herdr-app;
    # 0.1.15 uses a shell builtin test instead of executing /bin/test.
    # Keep the sandbox path patch, but target the fork's new implementation.
    postPatch =
      pkgs.lib.replaceStrings
        [
          ''Command::new("/bin/test")''
          ''Command::new("${pkgs.lib.getExe' pkgs.coreutils "test"}")''
        ]
        [
          ''Command::new("/bin/sh")''
          ''Command::new("${pkgs.runtimeShell}")''
        ]
        old.postPatch;
    cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
      pname = "herdr-desktop";
      version = "0.1.15";
      src = packageSources.herdr-app;
      hash = "sha256-usCdairGam65XVKtb1jJpRC0tNXnoafAnMFQjPgvgqQ=";
    };
  });
in
{
  herdr-core = core;
  herdr-desktop = desktop;
}
